// app/api/website/ai/restyle/apply/route.ts
// POST /api/website/ai/restyle/apply
// Applies an AI restyle plan to the website.
// Creates a "before" checkpoint, applies the design changes, and creates an
// "after" checkpoint. Does NOT publish — business must publish manually.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeRestylePlan } from '@/lib/website/ai/normalizeRestylePlan'
import { normalizeDesignSystem, serializeDesignSystem, buildCssVars } from '@/lib/website/design/normalizeDesignSystem'
import { createWebsiteVersion } from '@/lib/website/versioning'
import type { WebsiteRestylePlan, RestyleSectionContext } from '@/lib/website/ai/restyleTypes'

const bodySchema = z.object({
  tenantId:    z.string().uuid(),
  runId:       z.string().uuid().optional().nullable(),
  restylePlan: z.record(z.unknown()).optional(),
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

  const { tenantId, runId, restylePlan: bodyPlan } = body

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

  // ── Resolve the restyle plan ─────────────────────────────────────────────────
  let rawPlan: Record<string, unknown> | null = null

  if (bodyPlan && Object.keys(bodyPlan).length > 0) {
    rawPlan = bodyPlan
  } else   if (runId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: runRow } = await (db as any)
      .from('website_ai_restyle_runs')
      .select('restyle_plan, status, tenant_id')
      .eq('id', runId)
      .eq('tenant_id', tenantId)
      .single() as { data: { restyle_plan: Record<string, unknown>; status: string; tenant_id: string } | null; error: unknown }

    if (!runRow)
      return NextResponse.json({ error: 'Restyle run not found.' }, { status: 404 })

    rawPlan = runRow.restyle_plan as Record<string, unknown> | null
  }

  if (!rawPlan || Object.keys(rawPlan).length === 0)
    return NextResponse.json({ error: 'No restyle plan provided. Generate a preview first.' }, { status: 400 })

  // ── Load current sections ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dbSections } = await (db as any)
    .from('site_sections')
    .select('id, section_type, content, sort_order, page_id, style_config')
    .eq('tenant_id', tenantId)
    .eq('is_visible', true)
    .order('sort_order', { ascending: true }) as { data: Array<Record<string, unknown>> | null; error: unknown }

  if (!dbSections || dbSections.length === 0)
    return NextResponse.json({ error: 'No sections found. Build your website first.' }, { status: 400 })

  const sections: RestyleSectionContext[] = dbSections.map((s) => {
    const c = (typeof s.content === 'object' && s.content !== null ? s.content : {}) as Record<string, unknown>
    return {
      id:        s.id as string,
      type:      s.section_type as string,
      title:     String(c.headline ?? c.title ?? s.section_type ?? '').slice(0, 80) || null,
      sortOrder: (s.sort_order as number) ?? 0,
      pageId:    (s.page_id as string) ?? '',
    }
  })

  // ── Load business category ───────────────────────────────────────────────────
  const { data: tenant } = await db
    .from('tenants')
    .select('business_type, industry')
    .eq('id', tenantId)
    .single() as { data: Record<string, unknown> | null; error: unknown }

  const businessCategory = String(tenant?.business_type ?? tenant?.industry ?? 'general')

  // ── Normalize the plan ───────────────────────────────────────────────────────
  const { plan, error: normalizeError } = normalizeRestylePlan(rawPlan, {
    availableSections: sections,
    businessCategory,
  })

  if (normalizeError || !plan)
    return NextResponse.json({ error: normalizeError ?? 'Failed to process restyle plan.' }, { status: 400 })

  const warnings: string[] = [...(plan.warnings ?? [])]

  // ── Save "before" checkpoint ─────────────────────────────────────────────────
  const beforeVersion = await createWebsiteVersion({
    tenantId,
    label:       'Before AI Restyle',
    description: 'Auto-saved before applying AI Restyle. Restore this to undo.',
    source:      'before_ai_restyle',
    status:      'autosave',
    createdBy:   ctx.auth_id ?? undefined,
  })

  const beforeVersionId = beforeVersion.data?.id ?? null

  if (!beforeVersionId) {
    warnings.push('Could not save before-checkpoint: ' + (beforeVersion.error ?? 'unknown'))
  }

  // ── Apply design system to site_settings ─────────────────────────────────────
  const normalizedDs = normalizeDesignSystem(plan.designSystem, businessCategory)
  const serialized   = serializeDesignSystem(normalizedDs)
  const cssVars      = buildCssVars(normalizedDs)

  await db
    .from('site_settings')
    .update({
      theme:  { ...serialized, cssVars } as never,
      brand_colors: {
        primary:    normalizedDs.palette.primary,
        secondary:  normalizedDs.palette.secondary,
        accent:     normalizedDs.palette.accent,
        background: normalizedDs.palette.background,
        surface:    normalizedDs.palette.surface,
        text:       normalizedDs.palette.textPrimary,
        muted:      normalizedDs.palette.mutedText,
        border:     normalizedDs.palette.border,
      } as never,
      fonts: {
        heading: normalizedDs.typography.headingFontStack,
        body:    normalizedDs.typography.bodyFontStack,
      } as never,
      design_system:          { ...serialized, cssVars } as never,
      ai_design_generated_at: new Date().toISOString(),
      ai_design_source:       'ai_restyle',
    } as never)
    .eq('tenant_id', tenantId)

  // ── Apply section upgrades ───────────────────────────────────────────────────
  // Build a lookup of section upgrades by sectionId
  const upgradeMap = new Map<string, typeof plan.sectionUpgrades[0]>()
  for (const upgrade of plan.sectionUpgrades) {
    if (upgrade.sectionId) upgradeMap.set(upgrade.sectionId, upgrade)
  }

  // Also build a type-based fallback for upgrades without resolved IDs
  const upgradeByType = new Map<string, typeof plan.sectionUpgrades[0]>()
  for (const upgrade of plan.sectionUpgrades) {
    if (!upgrade.sectionId && upgrade.sectionType) {
      if (!upgradeByType.has(upgrade.sectionType)) {
        upgradeByType.set(upgrade.sectionType, upgrade)
      }
    }
  }

  let sectionsRestyled = 0
  for (const dbSection of dbSections) {
    const sectionId   = dbSection.id as string
    const sectionType = dbSection.section_type as string

    const upgrade = upgradeMap.get(sectionId) ?? upgradeByType.get(sectionType)
    if (!upgrade) continue

    const existingStyleConfig = (typeof dbSection.style_config === 'object' && dbSection.style_config !== null
      ? dbSection.style_config
      : {}) as Record<string, unknown>

    // Apply animation if present
    let animationConfig: Record<string, unknown> = {}
    if (plan.animationPlan) {
      const sectionAnim = plan.animationPlan.animations.find(
        (a) => a.targetType === 'section' && a.sectionId === sectionId
      )
      if (sectionAnim) {
        animationConfig = {
          preset:        sectionAnim.preset,
          intensity:     sectionAnim.intensity,
          durationMs:    sectionAnim.durationMs,
          delayMs:       sectionAnim.delayMs,
          easing:        sectionAnim.easing,
          mobileEnabled: sectionAnim.mobileEnabled,
          source:        'ai_restyle',
        }
      }
    }

    // Merge style_config.design — only update design fields, preserve everything else
    const newStyleConfig: Record<string, unknown> = {
      ...existingStyleConfig,
      design: upgrade.design,
    }

    const updatePayload: Record<string, unknown> = {
      style_config: newStyleConfig,
    }

    if (Object.keys(animationConfig).length > 0) {
      updatePayload.animation_config = animationConfig
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (db as any)
      .from('site_sections')
      .update(updatePayload as never)
      .eq('id', sectionId)
      .eq('tenant_id', tenantId) as { error: { message: string } | null }

    if (updateErr) {
      warnings.push(`Failed to update section ${sectionType}: ${updateErr.message}`)
    } else {
      sectionsRestyled++
    }
  }

  // ── Save "after" checkpoint ──────────────────────────────────────────────────
  const afterVersion = await createWebsiteVersion({
    tenantId,
    label:       `AI Restyle — ${plan.summary?.slice(0, 60) ?? 'Applied'}`,
    description: `AI Restyle applied. ${sectionsRestyled} sections updated. Source: ai_restyle.`,
    source:      'ai_restyle',
    status:      'draft',
    createdBy:   ctx.auth_id ?? undefined,
  })

  const afterVersionId = afterVersion.data?.id ?? null

  if (!afterVersionId) {
    warnings.push('Could not save after-checkpoint: ' + (afterVersion.error ?? 'unknown'))
  }

  // ── Update run record ────────────────────────────────────────────────────────
  if (runId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db as any).from('website_ai_restyle_runs').update({
      status:            'applied',
      applied_at:        new Date().toISOString(),
      before_version_id: beforeVersionId,
      after_version_id:  afterVersionId,
    }).eq('id', runId)
  }

  return NextResponse.json({
    ok:               true,
    runId,
    beforeVersionId,
    afterVersionId,
    sectionsRestyled,
    warnings,
  })
}
