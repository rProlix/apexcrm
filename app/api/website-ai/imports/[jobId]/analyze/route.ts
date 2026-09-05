// app/api/website-ai/imports/[jobId]/analyze/route.ts
// POST /api/website-ai/imports/[jobId]/analyze
// Runs Gemini analysis on the import job and creates suggestions.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess, verifyJobAccess } from '@/lib/website-ai/tenantAccess'
import { buildGeminiPrompt } from '@/lib/website-ai/prompt'
import { callGemini } from '@/lib/website-ai/geminiClient'
import { mapSuggestionToSection } from '@/lib/website-ai/sectionMapper'
import type { GeminiSuggestion, TenantContext } from '@/lib/website-ai/types'

type Params = { params: Promise<{ jobId: string }> }

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

export async function POST(req: NextRequest, { params }: Params) {
  const { jobId } = await params
  const startedAt = Date.now()
  const requestId = req.headers.get('x-vercel-id')

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return forbidden('You do not have permission to use AI Autofill for this website.')

  const tenantHint = new URL(req.url).searchParams.get('tenantId')
  const access = await requireAiAutofillAccess(tenantHint)
  if (!access) return forbidden('You do not have permission to use AI Autofill for this website.')

  const { tenantId } = access

  if (!(await verifyJobAccess(jobId, tenantId))) {
    return NextResponse.json(
      { error: 'This import does not belong to your business.' },
      { status: 403 }
    )
  }

  const db = getSupabaseServerClient()

  // Load the job
  const { data: jobRaw, error: jobErr } = await db
    .from('website_ai_import_jobs')
    .select('*')
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    .single()

  if (jobErr || !jobRaw) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  const job = jobRaw as Record<string, unknown>

  if (job.status === 'applied') {
    return NextResponse.json({ error: 'This job has already been applied.' }, { status: 409 })
  }

  if (job.status === 'analyzing') {
    return NextResponse.json({ error: 'Analysis is already in progress.' }, { status: 409 })
  }

  // Mark as analyzing. A failed state transition must not leave a job that looks active forever.
  const { error: analyzingError } = await db
    .from('website_ai_import_jobs')
    .update({ status: 'analyzing', error_message: null })
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
  if (analyzingError) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'website_autofill_state_transition_failed',
        requestId,
        jobId,
        durationMs: Date.now() - startedAt,
      })
    )
    return NextResponse.json(
      { error: 'Could not start website creation. Try again.' },
      { status: 500 }
    )
  }

  // Load tenant context
  const tenantContext = await loadTenantContext(tenantId)

  // Build prompt and call Gemini
  const prompt = buildGeminiPrompt(job.raw_input as string, tenantContext)
  const geminiResult = await callGemini({ prompt })

  if (geminiResult.error || !geminiResult.result) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'website_autofill_generation_failed',
        requestId,
        jobId,
        model: getWebsiteAiGeminiModelForLog(),
        technicalError: geminiResult.error ?? 'missing result',
        durationMs: Date.now() - startedAt,
      })
    )
    await db
      .from('website_ai_import_jobs')
      .update({
        status: 'failed',
        error_message:
          'AI analysis is temporarily unavailable. The content can be reviewed manually.',
        token_usage: geminiResult.tokenUsage as never,
      })
      .eq('id', jobId)

    return NextResponse.json(
      {
        error:
          'AI analysis is temporarily unavailable. Your content was saved and can be reviewed manually.',
      },
      { status: 502 }
    )
  }

  const result = geminiResult.result
  const resolvedTargets = await resolveSuggestionTargets(tenantId, result.suggestions)

  console.info(
    JSON.stringify({
      level: 'info',
      message: 'website_autofill_generation_complete',
      requestId,
      jobId,
      suggestionCount: result.suggestions.length,
      durationMs: Date.now() - startedAt,
    })
  )

  // Insert suggestions
  const suggestionRows = result.suggestions.map((s, index) => ({
    tenant_id: tenantId,
    job_id: jobId,
    suggestion_type: s.type as string,
    action: s.action as string,
    title: s.title,
    description: s.reason,
    reason: s.reason,
    extracted_data: s.data as never,
    proposed_section: s.proposedSection as never,
    target_page_id: resolvedTargets[index]?.pageId ?? null,
    target_section_id: resolvedTargets[index]?.sectionId ?? null,
    confidence: s.confidence,
    status: 'pending',
  }))

  if (suggestionRows.length > 0) {
    const { error: insertErr } = await db.from('website_ai_suggestions').insert(suggestionRows)

    if (insertErr) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'website_autofill_suggestion_insert_failed',
          requestId,
          jobId,
          technicalError: insertErr.message,
          durationMs: Date.now() - startedAt,
        })
      )
      await db
        .from('website_ai_import_jobs')
        .update({ status: 'failed', error_message: 'Website sections could not be saved.' })
        .eq('id', jobId)

      return NextResponse.json(
        { error: 'Website sections could not be saved. Please try again.' },
        { status: 500 }
      )
    }
  }

  // Update job to ready
  const { data: updatedJob, error: readyError } = await db
    .from('website_ai_import_jobs')
    .update({
      status: 'ready',
      summary: result.summary,
      detected_business_type: result.detectedBusinessType,
      detected_content_types: result.detectedContentTypes,
      confidence: result.overallConfidence,
      token_usage: geminiResult.tokenUsage as never,
      metadata: {
        warnings: result.warnings,
        missingInfoQuestions: result.missingInfoQuestions,
        designSystem: result.designSystem ?? null,
      } as never,
    })
    .eq('id', jobId)
    .select('*')
    .single()

  if (readyError || !updatedJob) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'website_autofill_ready_transition_failed',
        requestId,
        jobId,
        technicalError: readyError?.message ?? 'missing updated job',
        durationMs: Date.now() - startedAt,
      })
    )
    return NextResponse.json(
      { error: 'The website plan was generated but could not be finalized. Please try again.' },
      { status: 500 }
    )
  }

  // Fetch created suggestions
  const { data: suggestions, error: suggestionsError } = await db
    .from('website_ai_suggestions')
    .select('*')
    .eq('job_id', jobId)
    .eq('tenant_id', tenantId)
    .order('created_at')

  if (suggestionsError) {
    console.error(
      JSON.stringify({
        level: 'error',
        message: 'website_autofill_suggestion_read_failed',
        requestId,
        jobId,
        technicalError: suggestionsError.message,
      })
    )
  }

  return NextResponse.json({
    job: updatedJob,
    suggestions: suggestions ?? [],
    warnings: result.warnings,
    missingInfoQuestions: result.missingInfoQuestions,
  })
}

async function resolveSuggestionTargets(
  tenantId: string,
  suggestions: GeminiSuggestion[]
): Promise<Array<{ pageId: string | null; sectionId: string | null }>> {
  const db = getSupabaseServerClient()
  const [{ data: pages }, { data: sections }] = await Promise.all([
    db
      .from('site_pages')
      .select('id, slug, page_type, sort_order')
      .eq('tenant_id', tenantId)
      .neq('status', 'archived')
      .order('sort_order'),
    db
      .from('site_sections')
      .select('id, page_id, section_type, is_visible, sort_order')
      .eq('tenant_id', tenantId)
      .order('sort_order'),
  ])

  const normalizedSlug = (value: string) => value.trim().replace(/^\/+|\/+$/g, '')
  const homePage =
    (pages ?? []).find((page) => page.page_type === 'home') ??
    (pages ?? []).find((page) => normalizedSlug(page.slug) === '') ??
    pages?.[0]
  const pageBySlug = new Map(
    (pages ?? []).map((page) => [normalizedSlug(page.slug), page.id] as const)
  )

  return suggestions.map((suggestion) => {
    const requestedSlug = suggestion.target?.pageSlug
      ? normalizedSlug(suggestion.target.pageSlug)
      : ''
    const pageId = pageBySlug.get(requestedSlug) ?? homePage?.id ?? null
    const mappedType = mapSuggestionToSection(suggestion).section_type
    const section =
      suggestion.action === 'create'
        ? null
        : ((sections ?? []).find(
            (candidate) =>
              candidate.page_id === pageId &&
              candidate.section_type === mappedType &&
              candidate.is_visible
          ) ??
          (sections ?? []).find(
            (candidate) => candidate.page_id === pageId && candidate.section_type === mappedType
          ))

    return { pageId, sectionId: section?.id ?? null }
  })
}

// ── Tenant context loader ──────────────────────────────────────────────────────

async function loadTenantContext(tenantId: string): Promise<TenantContext> {
  const db = getSupabaseServerClient()
  // The generated Supabase types lag the business-profile and Website Builder
  // columns used by current migrations. Keep the escape hatch local to these
  // reads rather than weakening the rest of the module.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbClient = db as any

  const [
    tenantResult,
    onboardingResult,
    settingsResult,
    pagesResult,
    sectionsResult,
    storeModuleResult,
    productsResult,
  ] = await Promise.all([
    db.from('tenants').select('id, name').eq('id', tenantId).maybeSingle(),
    dbClient
      .from('business_onboarding_responses')
      .select('business_name, business_type, business_category, business_description')
      .eq('tenant_id', tenantId)
      .order('completed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('site_settings').select('site_name').eq('tenant_id', tenantId).maybeSingle(),
    db
      .from('site_pages')
      .select('id, slug, title, page_type')
      .eq('tenant_id', tenantId)
      .neq('status', 'archived')
      .order('sort_order')
      .limit(20),
    dbClient
      .from('site_sections')
      .select('page_id, section_type, content')
      .eq('tenant_id', tenantId)
      .eq('is_visible', true)
      .order('sort_order')
      .limit(80),
    db
      .from('tenant_modules')
      .select('enabled')
      .eq('tenant_id', tenantId)
      .eq('module_key', 'store')
      .maybeSingle(),
    db.from('products').select('name').eq('tenant_id', tenantId).limit(50),
  ])

  const tenant = tenantResult.data
  const onboarding = onboardingResult.data
  const settings = settingsResult.data
  const pages = pagesResult.data ?? []
  const hasStore = storeModuleResult.data?.enabled === true
  const productNames = (productsResult.data ?? []).map((p: { name: string }) => p.name)

  const pageSlugById = new Map(
    pages.map((page: { id: string; slug: string }) => [page.id, page.slug])
  )
  const businessType = onboarding?.business_type ?? onboarding?.business_category ?? null

  return {
    tenantId,
    tenantName: onboarding?.business_name ?? tenant?.name ?? 'Business',
    businessType,
    businessDescription: onboarding?.business_description ?? null,
    hasStore,
    siteName: settings?.site_name ?? null,
    existingPages: pages.map((p: { slug: string; title: string | null; page_type: string }) => ({
      slug: p.slug,
      title: p.title,
      page_type: p.page_type,
    })),
    existingSections: (sectionsResult.data ?? []).map(
      (section: { page_id: string; section_type: string; content: unknown }) => {
        const content =
          section.content && typeof section.content === 'object' && !Array.isArray(section.content)
            ? (section.content as Record<string, unknown>)
            : {}
        const rawTitle = content.headline ?? content.heading ?? content.title
        return {
          pageSlug: pageSlugById.get(section.page_id) ?? '',
          sectionType: section.section_type,
          title: typeof rawTitle === 'string' ? rawTitle.slice(0, 100) : null,
        }
      }
    ),
    existingProductNames: productNames,
  }
}

function getWebsiteAiGeminiModelForLog(): string {
  return process.env.WEBSITE_AI_GEMINI_MODEL?.trim() || 'default'
}
