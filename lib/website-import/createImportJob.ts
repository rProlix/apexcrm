// lib/website-import/createImportJob.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { validateImportUrl } from './fetchSource'
import type { CreateImportJobInput, ImportJob, ImportSource } from './types'

export interface CreateImportJobResult {
  job:     ImportJob
  sources: ImportSource[]
}

/**
 * Inserts a new import job and its source rows.
 * Validates each URL before persisting — invalid URLs are silently dropped.
 * Throws if no valid URLs remain after filtering.
 */
export async function createImportJob(
  input: CreateImportJobInput,
): Promise<CreateImportJobResult> {
  const db = getSupabaseServerClient()

  const validUrls = input.sourceUrls.filter((u) => validateImportUrl(u) === null)

  if (validUrls.length === 0) {
    throw new Error('No valid URLs provided. Ensure all URLs are public http/https addresses.')
  }

  // Insert job
  const { data: job, error: jobErr } = await db
    .from('website_import_jobs')
    .insert({
      tenant_id:   input.tenantId,
      created_by:  input.createdBy,
      status:      'queued',
      source_urls: validUrls,
      notes:       input.notes ?? null,
      progress:    0,
    })
    .select('*')
    .single()

  if (jobErr || !job) {
    throw new Error(jobErr?.message ?? 'Failed to create import job')
  }

  // Insert source rows (one per URL)
  const sourceRows = validUrls.map((url) => ({
    tenant_id:     input.tenantId,
    job_id:        job.id,
    source_url:    url,
    source_type:   detectSourceType(url),
    fetched_status: 'pending' as const,
  }))

  const { data: sources, error: srcErr } = await db
    .from('website_import_sources')
    .insert(sourceRows)
    .select('*')

  if (srcErr) {
    throw new Error(srcErr.message ?? 'Failed to create import sources')
  }

  // Audit
  await db.from('website_import_audit').insert({
    tenant_id: input.tenantId,
    job_id:    job.id,
    action:    'job_created',
    metadata:  { url_count: validUrls.length, urls: validUrls },
  })

  return { job: job as ImportJob, sources: (sources ?? []) as ImportSource[] }
}

/**
 * Heuristically detect what type of source a URL represents.
 */
function detectSourceType(url: string): 'website' | 'yelp' | 'business_profile' {
  const lower = url.toLowerCase()
  if (lower.includes('yelp.com')) return 'yelp'
  if (
    lower.includes('google.com/maps') ||
    lower.includes('facebook.com') ||
    lower.includes('tripadvisor.com') ||
    lower.includes('foursquare.com') ||
    lower.includes('yellowpages.com')
  ) {
    return 'business_profile'
  }
  return 'website'
}
