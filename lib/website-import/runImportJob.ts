// lib/website-import/runImportJob.ts
// Orchestrates the full import pipeline for a single job.
// Called from the /api/website-import/jobs/[id]/run route.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { fetchSource, checkRobotsTxt } from './fetchSource'
import { parseMetadata }       from './parseMetadata'
import { parseStructuredData } from './parseStructuredData'
import { parseVisibleContent } from './parseVisibleContent'
import { extractBusinessFields } from './extractBusinessFields'
import { deduplicateImportData } from './deduplicateImportData'
import { normalizeImportedContent } from './normalizeImportedContent'
import { mapImportToSite } from './mapImportToSite'
import { saveDraftSiteFromImport } from './saveDraftSiteFromImport'
import type { ExtractedBusinessFields } from './types'

const DELAY_BETWEEN_REQUESTS_MS = 1_500  // Rate limit: ~0.67 req/sec

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Progress checkpoints (0–100) as the job moves through stages.
 */
const PROGRESS = {
  started:    5,
  fetching:   (i: number, total: number) => 5 + Math.round((i / total) * 50),
  extracting: 65,
  mapping:    80,
  saving:     90,
  done:       100,
}

async function updateJobProgress(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  jobId:    string,
  progress: number,
  status:   string = 'running',
): Promise<void> {
  await db
    .from('website_import_jobs')
    .update({ progress, status, updated_at: new Date().toISOString() })
    .eq('id', jobId)
}

async function markSourceStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  sourceId:    string,
  status:      'fetched' | 'failed',
  title:       string | null = null,
  metadata:    Record<string, unknown> | null = null,
  confidence:  number = 0,
  rawText:     string | null = null,
): Promise<void> {
  await db
    .from('website_import_sources')
    .update({
      fetched_status:  status,
      page_title:      title,
      raw_metadata:    metadata,
      confidence_score: confidence,
      raw_text:        rawText?.slice(0, 50_000) ?? null,
      updated_at:      new Date().toISOString(),
    })
    .eq('id', sourceId)
}

/**
 * Main import pipeline runner.
 * Designed to be called once per job. Idempotent on repeated runs
 * (re-running a completed job will overwrite draft content).
 */
export async function runImportJob(
  jobId:    string,
  tenantId: string,
): Promise<{ success: boolean; error?: string }> {
  const db = getSupabaseServerClient() as any

  // ── Load job + sources ────────────────────────────────────────────────────

  const { data: job, error: jobErr } = await db
    .from('website_import_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .single()

  if (jobErr || !job) {
    return { success: false, error: 'Job not found' }
  }

  if (job.status === 'running') {
    return { success: false, error: 'Job is already running' }
  }

  const { data: sources, error: srcErr } = await db
    .from('website_import_sources')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })

  if (srcErr || !sources?.length) {
    return { success: false, error: 'No sources found for job' }
  }

  // Mark as running
  await db
    .from('website_import_jobs')
    .update({
      status:     'running',
      started_at: new Date().toISOString(),
      progress:   PROGRESS.started,
    })
    .eq('id', jobId)

  await db.from('website_import_audit').insert({
    tenant_id: tenantId,
    job_id:    jobId,
    action:    'job_started',
    metadata:  { source_count: sources.length },
  })

  // ── Fetch + parse each source ─────────────────────────────────────────────

  const allExtracted: ExtractedBusinessFields[] = []
  let successCount = 0

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]

    await updateJobProgress(db, jobId, PROGRESS.fetching(i, sources.length))

    // Rate limiting
    if (i > 0) await sleep(DELAY_BETWEEN_REQUESTS_MS)

    try {
      // Check robots.txt (advisory, non-blocking)
      const robotsOk = await checkRobotsTxt(source.source_url)
      if (!robotsOk) {
        await markSourceStatus(db, source.id, 'failed', 'Blocked by robots.txt', null, 0)
        await db.from('website_import_audit').insert({
          tenant_id: tenantId,
          job_id:    jobId,
          action:    'source_blocked_robots',
          metadata:  { url: source.source_url },
        })
        continue
      }

      // Fetch
      const fetched = await fetchSource(source.source_url)

      // Parse
      const metadata   = parseMetadata(fetched.html, fetched.finalUrl)
      const structured = parseStructuredData(fetched.html)
      const visible    = parseVisibleContent(fetched.html, fetched.finalUrl)

      // Extract
      const extracted = extractBusinessFields({
        metadata,
        structured,
        visible,
        sourceUrl:  source.source_url,
        sourceType: source.source_type as 'website' | 'yelp' | 'business_profile' | 'manual',
      })

      allExtracted.push(extracted)
      successCount++

      // Calculate average confidence across fields
      const confValues = Object.values(extracted)
        .filter((v): v is { confidence: number } => v != null && typeof v === 'object' && 'confidence' in v)
        .map((v) => v.confidence)
      const avgConf = confValues.length
        ? confValues.reduce((a, b) => a + b, 0) / confValues.length
        : 0

      await markSourceStatus(
        db,
        source.id,
        'fetched',
        metadata.title ?? metadata.ogTitle ?? null,
        {
          finalUrl:    fetched.finalUrl,
          statusCode:  fetched.statusCode,
          contentType: fetched.contentType,
          fetchedAt:   fetched.fetchedAt,
          og:          { title: metadata.ogTitle, description: metadata.ogDescription },
          structured:  { name: structured.name, type: structured.type },
        },
        parseFloat(avgConf.toFixed(2)),
        // Save truncated raw text for review
        visible.headings.join('\n') + '\n' + visible.paragraphs.slice(0, 5).join('\n'),
      )

      // Save extracted images as import media
      const mediaRows = [
        ...(extracted.logoUrl ? [{
          source_url: source.source_url,
          asset_url:  extracted.logoUrl.value,
          asset_type: 'logo',
          alt_text:   extracted.businessName?.value ?? 'Logo',
        }] : []),
        ...(extracted.faviconUrl ? [{
          source_url: source.source_url,
          asset_url:  extracted.faviconUrl.value,
          asset_type: 'favicon',
          alt_text:   'Favicon',
        }] : []),
        ...(extracted.images?.value.slice(0, 10).map((img) => ({
          source_url: source.source_url,
          asset_url:  img.src,
          asset_type: 'gallery',
          alt_text:   img.alt || null,
        })) ?? []),
      ]

      if (mediaRows.length > 0) {
        await db.from('website_import_media').insert(
          mediaRows.map((r) => ({
            ...r,
            tenant_id: tenantId,
            job_id:    jobId,
          })),
        )
      }

    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[runImportJob] source ${source.source_url} failed:`, msg)
      await markSourceStatus(db, source.id, 'failed', null, { error: msg }, 0)
      await db.from('website_import_audit').insert({
        tenant_id: tenantId,
        job_id:    jobId,
        action:    'source_failed',
        metadata:  { url: source.source_url, error: msg },
      })
    }
  }

  // ── Check if all sources failed ───────────────────────────────────────────

  if (successCount === 0) {
    await db
      .from('website_import_jobs')
      .update({
        status:        'failed',
        error_message: 'All source URLs failed to fetch',
        progress:      0,
        completed_at:  new Date().toISOString(),
      })
      .eq('id', jobId)

    return { success: false, error: 'All source URLs failed to fetch' }
  }

  // ── Deduplicate + normalize ───────────────────────────────────────────────

  await updateJobProgress(db, jobId, PROGRESS.extracting)

  const merged    = deduplicateImportData(allExtracted)
  const content   = normalizeImportedContent(merged)

  // ── Map to site structure ────────────────────────────────────────────────

  await updateJobProgress(db, jobId, PROGRESS.mapping)

  const draftConfig = mapImportToSite(content)

  // ── Save draft ────────────────────────────────────────────────────────────

  await updateJobProgress(db, jobId, PROGRESS.saving)

  try {
    await saveDraftSiteFromImport(tenantId, jobId, draftConfig, content)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await db
      .from('website_import_jobs')
      .update({
        status:        'failed',
        error_message: msg,
        completed_at:  new Date().toISOString(),
      })
      .eq('id', jobId)
    return { success: false, error: msg }
  }

  return { success: true }
}
