// app/api/website/ai/restyle/route.ts
// POST /api/website/ai/restyle
// Generates an AI restyle plan for an existing website.
// Does NOT modify the website — returns a preview-ready plan only.
// The business can review the plan and apply it via /api/website/ai/restyle/apply.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { callGeminiText } from '@/lib/ai/geminiRequest'
import { getWebsiteAiGeminiModel } from '@/lib/ai/geminiConfig'
import { buildRestylePrompt } from '@/lib/website/ai/buildRestylePrompt'
import { normalizeRestylePlan } from '@/lib/website/ai/normalizeRestylePlan'
import type { RestyleSectionContext, RestyleBusinessContext } from '@/lib/website/ai/restyleTypes'

const bodySchema = z.object({
  tenantId:                z.string().uuid(),
  pageId:                  z.string().uuid().optional().nullable(),
  stylePreset:             z.string().min(1),
  customPrompt:            z.string().max(2000).optional().nullable(),
  intensity:               z.enum(['subtle', 'balanced', 'cinematic']).default('balanced'),
  preserveContent:         z.boolean().default(true),
  preserveImages:          z.boolean().default(false),
  generateImageSuggestions:z.boolean().default(true),
  applyAnimations:         z.boolean().default(true),
  mobileFirst:             z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body', detail: String(err) }, { status: 400 })
  }

  const {
    tenantId, pageId, stylePreset, customPrompt, intensity,
    preserveContent, preserveImages, generateImageSuggestions, applyAnimations, mobileFirst,
  } = body

  // ── Gemini key check ─────────────────────────────────────────────────────────
  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: 'AI analysis is not configured. Contact an administrator.' }, { status: 503 })

  const db = getSupabaseServerClient()

  // ── Tenant access verification ───────────────────────────────────────────────
  const { data: userRow } = await db
    .from('users')
    .select('tenant_id, role')
    .eq('auth_user_id', ctx.auth_id)
    .in('role', ['owner', 'admin'])
    .single()

  if (!userRow || userRow.tenant_id !== tenantId)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  // ── Load business context ────────────────────────────────────────────────────
  const { data: tenant } = await db
    .from('tenants')
    .select('id, name, business_type, industry, description')
    .eq('id', tenantId)
    .single() as { data: Record<string, unknown> | null; error: unknown }

  if (!tenant)
    return NextResponse.json({ error: 'Tenant not found.' }, { status: 404 })

  // ── Load current site settings (theme/design) ────────────────────────────────
  const { data: settings } = await db
    .from('site_settings')
    .select('theme, design_system, brand_colors, fonts')
    .eq('tenant_id', tenantId)
    .maybeSingle() as { data: Record<string, unknown> | null; error: unknown }

  // ── Load sections ────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbClient = db as any
  const sectionsBaseQuery = pageId
    ? dbClient
        .from('site_sections')
        .select('id, section_type, content, sort_order, page_id, style_config')
        .eq('tenant_id', tenantId)
        .eq('page_id', pageId)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
    : dbClient
        .from('site_sections')
        .select('id, section_type, content, sort_order, page_id, style_config')
        .eq('tenant_id', tenantId)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true })
        .limit(40)

  const { data: dbSections } = await sectionsBaseQuery as { data: Array<Record<string, unknown>> | null; error: unknown }

  if (!dbSections || dbSections.length === 0)
    return NextResponse.json({ error: 'No sections found. Build your website first before using AI Restyle.' }, { status: 400 })

  // Build section context for prompt
  const sections: RestyleSectionContext[] = dbSections.map((s) => {
    const c = (typeof s.content === 'object' && s.content !== null ? s.content : {}) as Record<string, unknown>
    const sc = (typeof s.style_config === 'object' && s.style_config !== null ? s.style_config : {}) as Record<string, unknown>
    return {
      id:            s.id as string,
      type:          s.section_type as string,
      title:         String(c.headline ?? c.title ?? c.name ?? s.section_type ?? '').slice(0, 80) || null,
      sortOrder:     (s.sort_order as number) ?? 0,
      pageId:        (s.page_id as string) ?? '',
      currentDesign: (sc.design as Record<string, unknown> | null) ?? null,
    }
  })

  const businessContext: RestyleBusinessContext = {
    businessName:     String(tenant.name ?? 'The Business'),
    businessType:     String(tenant.business_type ?? tenant.industry ?? 'general'),
    businessCategory: String(tenant.business_type ?? tenant.industry ?? 'general'),
    description:      String(tenant.description ?? ''),
    currentTheme:     (settings?.theme as Record<string, unknown> | null) ?? null,
  }

  // ── Create a "planned" run record ────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runRecord, error: runInsertErr } = await (db as any)
    .from('website_ai_restyle_runs')
    .insert({
      tenant_id:        tenantId,
      created_by:       ctx.auth_id ?? null,
      status:           'planned',
      style_preset:     stylePreset,
      custom_prompt:    customPrompt ?? null,
      intensity,
      preserve_content: preserveContent,
      preserve_images:  preserveImages,
      restyle_plan:     {},
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }

  if (runInsertErr || !runRecord) {
    console.error('[AI-RESTYLE] Failed to create run record:', runInsertErr?.message)
    // Non-fatal — continue without a run record
  }

  const runId = (runRecord as { id: string } | null)?.id ?? null

  // ── Build Gemini prompt ──────────────────────────────────────────────────────
  const prompt = buildRestylePrompt({
    business: businessContext,
    sections,
    stylePreset,
    customPrompt,
    intensity,
    preserveImages,
    generateImageSuggestions,
    applyAnimations,
    mobileFirst,
  })

  // ── Call Gemini ──────────────────────────────────────────────────────────────
  const model = process.env.WEBSITE_AI_GEMINI_MODEL?.trim() ?? getWebsiteAiGeminiModel()

  const { text, error: aiError } = await callGeminiText({
    model,
    prompt,
    feature:         'website-restyle',
    temperature:     0.35,
    topK:            40,
    topP:            0.95,
    maxOutputTokens: 16384,
    timeoutMs:       90_000,
  })

  if (aiError || !text) {
    if (runId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('website_ai_restyle_runs').update({
        status:        'failed',
        error_message: aiError ?? 'AI returned no content',
      }).eq('id', runId)
    }
    return NextResponse.json({ error: aiError ?? 'AI returned no content.' }, { status: 500 })
  }

  // ── Parse raw JSON from Gemini ───────────────────────────────────────────────
  let rawPlan: unknown = null
  try {
    let cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
    const start = cleaned.indexOf('{')
    const end   = cleaned.lastIndexOf('}')
    if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1)
    rawPlan = JSON.parse(cleaned)
  } catch {
    rawPlan = null
  }

  if (!rawPlan) {
    if (runId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('website_ai_restyle_runs').update({
        status:        'failed',
        error_message: 'AI returned unparseable JSON',
      }).eq('id', runId)
    }
    return NextResponse.json({ error: 'AI returned an unparseable response. Please try again.' }, { status: 500 })
  }

  // ── Normalize plan ────────────────────────────────────────────────────────────
  const { plan, error: normalizeError } = normalizeRestylePlan(rawPlan, {
    availableSections: sections,
    businessCategory:  businessContext.businessCategory,
  })

  if (normalizeError || !plan) {
    if (runId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (db as any).from('website_ai_restyle_runs').update({
        status:        'failed',
        error_message: normalizeError ?? 'Plan normalization failed',
      }).eq('id', runId)
    }
    return NextResponse.json({ error: normalizeError ?? 'Failed to process AI response.' }, { status: 500 })
  }

  // ── Save the normalized plan to the run record ───────────────────────────────
  if (runId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('website_ai_restyle_runs').update({
      restyle_plan: plan as never,
    }).eq('id', runId)
  }

  return NextResponse.json({
    ok: true,
    runId,
    restylePlan: plan,
  })
}
