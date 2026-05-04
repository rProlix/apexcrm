// app/api/website-ai/imports/[jobId]/analyze/route.ts
// POST /api/website-ai/imports/[jobId]/analyze
// Runs Gemini analysis on the import job and creates suggestions.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess, verifyJobAccess } from '@/lib/website-ai/tenantAccess'
import { buildGeminiPrompt } from '@/lib/website-ai/prompt'
import { callGemini } from '@/lib/website-ai/geminiClient'
import type { TenantContext } from '@/lib/website-ai/types'

type Params = { params: Promise<{ jobId: string }> }

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { jobId } = await params

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden('You do not have permission to use AI Autofill for this website.')

  const access = await requireAiAutofillAccess()
  if (!access) return forbidden('You do not have permission to use AI Autofill for this website.')

  const { tenantId } = access

  if (!(await verifyJobAccess(jobId, tenantId))) {
    return NextResponse.json({ error: 'This import does not belong to your business.' }, { status: 403 })
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

  // Mark as analyzing
  await db
    .from('website_ai_import_jobs')
    .update({ status: 'analyzing' })
    .eq('id', jobId)

  // Load tenant context
  const tenantContext = await loadTenantContext(tenantId)

  // Build prompt and call Gemini
  const prompt = buildGeminiPrompt(job.raw_input as string, tenantContext)
  const geminiResult = await callGemini({ prompt })

  if (geminiResult.error || !geminiResult.result) {
    await db
      .from('website_ai_import_jobs')
      .update({
        status:        'failed',
        error_message: geminiResult.error ?? 'Unknown Gemini error',
        token_usage:   geminiResult.tokenUsage as never,
      })
      .eq('id', jobId)

    return NextResponse.json(
      { error: geminiResult.error ?? 'Gemini analysis failed' },
      { status: 502 }
    )
  }

  const result = geminiResult.result

  // Insert suggestions
  const suggestionRows = result.suggestions.map((s) => ({
    tenant_id:        tenantId,
    job_id:           jobId,
    suggestion_type:  s.type as string,
    action:           s.action as string,
    title:            s.title,
    description:      s.reason,
    reason:           s.reason,
    extracted_data:   s.data as never,
    proposed_section: s.proposedSection as never,
    confidence:       s.confidence,
    status:           'pending',
  }))

  if (suggestionRows.length > 0) {
    const { error: insertErr } = await db
      .from('website_ai_suggestions')
      .insert(suggestionRows)

    if (insertErr) {
      await db
        .from('website_ai_import_jobs')
        .update({ status: 'failed', error_message: insertErr.message })
        .eq('id', jobId)

      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }
  }

  // Update job to ready
  const { data: updatedJob } = await db
    .from('website_ai_import_jobs')
    .update({
      status:                 'ready',
      summary:                result.summary,
      detected_business_type: result.detectedBusinessType,
      detected_content_types: result.detectedContentTypes,
      confidence:             result.overallConfidence,
      token_usage:            geminiResult.tokenUsage as never,
      metadata:               {
        warnings:             result.warnings,
        missingInfoQuestions: result.missingInfoQuestions,
      } as never,
    })
    .eq('id', jobId)
    .select('*')
    .single()

  // Fetch created suggestions
  const { data: suggestions } = await db
    .from('website_ai_suggestions')
    .select('*')
    .eq('job_id', jobId)
    .eq('tenant_id', tenantId)
    .order('created_at')

  return NextResponse.json({
    job:         updatedJob,
    suggestions: suggestions ?? [],
    warnings:    result.warnings,
    missingInfoQuestions: result.missingInfoQuestions,
  })
}

// ── Tenant context loader ──────────────────────────────────────────────────────

async function loadTenantContext(tenantId: string): Promise<TenantContext> {
  const db = getSupabaseServerClient()

  const [tenantResult, settingsResult, pagesResult, storeModuleResult, productsResult] =
    await Promise.all([
      db.from('tenants').select('id, name').eq('id', tenantId).maybeSingle(),
      db.from('site_settings').select('site_name').eq('tenant_id', tenantId).maybeSingle(),
      db.from('site_pages').select('slug, title, page_type').eq('tenant_id', tenantId).neq('status', 'archived').order('sort_order').limit(20),
      db.from('tenant_modules').select('enabled').eq('tenant_id', tenantId).eq('module_key', 'store').maybeSingle(),
      db.from('products').select('name').eq('tenant_id', tenantId).limit(50),
    ])

  const tenant      = tenantResult.data
  const settings    = settingsResult.data
  const pages       = pagesResult.data ?? []
  const hasStore    = storeModuleResult.data?.enabled === true
  const productNames = (productsResult.data ?? []).map((p: { name: string }) => p.name)

  const businessType = null  // Could be extended via tenant branding/metadata

  return {
    tenantId,
    tenantName:   tenant?.name ?? 'Business',
    businessType,
    hasStore,
    siteName:     settings?.site_name ?? null,
    existingPages: pages.map((p: { slug: string; title: string | null; page_type: string }) => ({
      slug:      p.slug,
      title:     p.title,
      page_type: p.page_type,
    })),
    existingProductNames: productNames,
  }
}
