// app/api/website/ai/animations/apply/route.ts
// POST /api/website/ai/animations/apply
//
// Converts a validated AI animation plan into animation_config / style_config
// and applies it to site_sections, site_pages, or tenants.
//
// Handles all three targetType values from the AI plan:
//   page      → save to page config  + page-level componentAnimations
//   section   → update site_sections.animation_config.animation + style
//   component → merge into site_sections.animation_config.componentAnimations
//               keyed by componentType/componentKey/componentSelector
//
// Returns detailed counts of applied / skipped operations.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { ValidatedAiAnimationPlan } from '@/lib/website/animations/validateAnimationConfig'
import { normalizeAnimationIntensity } from '@/lib/website/animations/validateAnimationConfig'
import type { WebsiteAnimationPlan } from '@/lib/website/animations/types'

const bodySchema = z.object({
  planId:                z.string().uuid(),
  applyScope:            z.enum(['global', 'page', 'section']).optional(),
  selectedAnimationKeys: z.array(z.string()).optional(),
})

// Helper: build a base animation_config for a section
function makeAnimConfig(overrides: Record<string, unknown> = {}) {
  return { v: 1, enabled: true, animation: {}, style: {}, componentAnimations: {}, performance: {}, ...overrides }
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: z.infer<typeof bodySchema>
  try { body = bodySchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: 'Invalid body', detail: String(err) }, { status: 400 }) }

  const { planId, selectedAnimationKeys } = body
  const supabase = getSupabaseServerClient()

  // ── Load plan ───────────────────────────────────────────────────────────────
  const { data: planRow, error: planErr } = await supabase
    .from('website_animation_plans')
    .select('*')
    .eq('id', planId)
    .single()

  if (planErr || !planRow)
    return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })

  const plan = planRow as unknown as WebsiteAnimationPlan

  // ── Verify tenant access ────────────────────────────────────────────────────
  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('auth_user_id', ctx.auth_id)
    .single()
  if (!userRow || userRow.tenant_id !== plan.tenant_id)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const tenantId = plan.tenant_id
  const aiPlan   = plan.ai_plan as Partial<ValidatedAiAnimationPlan>
  const rawAnimations = aiPlan.animations ?? []
  const upgrades      = aiPlan.sectionUpgrades ?? []
  const scope         = body.applyScope ?? plan.scope
  const now           = new Date().toISOString()
  const warnings: string[] = []

  // ── Normalize intensity values in all animations (defense-in-depth) ─────────
  // Plans stored before the normalization pipeline was deployed may contain
  // raw values like "high", "medium", "bold". Normalise them here before saving
  // into section configs so we never write invalid values to the DB.
  const animations = rawAnimations.map((a, idx) => {
    const raw = a.intensity as string | undefined
    const normalized = normalizeAnimationIntensity(raw)
    if (raw && raw !== normalized) {
      warnings.push(
        `Normalized animation intensity from "${raw}" to "${normalized}" for animation index ${idx} (targetKey: ${a.targetKey ?? 'unknown'})`
      )
      return { ...a, intensity: normalized }
    }
    return a
  })

  // Filter to selected keys if specified
  const filteredAnimations = selectedAnimationKeys?.length
    ? animations.filter(a => selectedAnimationKeys.includes(a.targetKey))
    : animations

  // ── Separate animations by targetType ──────────────────────────────────────
  const pageAnimations      = filteredAnimations.filter(a => a.targetType === 'page')
  const sectionAnimations   = filteredAnimations.filter(a => a.targetType === 'section')
  const componentAnimations = filteredAnimations.filter(a => a.targetType === 'component')

  let appliedPageAnimations      = 0
  let appliedSectionAnimations   = 0
  let appliedComponentAnimations = 0
  const errors: string[]    = []
  const skippedAnimations: Array<{ key: string; reason: string }> = []

  // ── Helper: read current animation_config for a section ───────────────────
  async function loadSectionConfig(sectionId: string): Promise<Record<string, unknown>> {
    const { data } = await supabase
      .from('site_sections')
      .select('animation_config')
      .eq('id', sectionId)
      .single()
    const raw = (data as unknown as Record<string, unknown>)?.animation_config
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return raw as Record<string, unknown>
    }
    return makeAnimConfig()
  }

  // ── Helper: write animation_config for a section ──────────────────────────
  async function saveSectionConfig(sectionId: string, config: Record<string, unknown>): Promise<boolean> {
    const { error } = await supabase
      .from('site_sections')
      .update({ animation_config: config as never, updated_at: now } as never)
      .eq('id', sectionId)
      .eq('tenant_id', tenantId)      // always tenant-safe
    if (error) { errors.push(`Section ${sectionId}: ${error.message}`); return false }
    return true
  }

  // ── Apply: SINGLE SECTION scope ────────────────────────────────────────────
  if (scope === 'section' && plan.site_section_id) {
    const sectionId = plan.site_section_id

    const config = await loadSectionConfig(sectionId)
    const upgrade = upgrades[0] ?? null

    // Section-level animation
    const secAnim = sectionAnimations.find(a =>
      !a.targetKey || a.targetKey === 'global' || a.sectionId === sectionId
    ) ?? sectionAnimations[0] ?? null
    if (secAnim) {
      config.animation = {
        preset:        secAnim.animationPreset,
        intensity:     secAnim.intensity,
        durationMs:    secAnim.durationMs,
        delayMs:       secAnim.delayMs,
        staggerMs:     secAnim.staggerMs,
        easing:        secAnim.easing,
        mobileEnabled: secAnim.mobileEnabled,
      }
      appliedSectionAnimations++
    }

    // Style upgrade
    if (upgrade) {
      config.style = {
        stylePreset:     upgrade.stylePreset,
        imageTreatment:  upgrade.imageTreatment,
        buttonTreatment: upgrade.buttonTreatment,
      }
    }

    // Component animations
    const compAnims: Record<string, unknown> = (config.componentAnimations as Record<string, unknown>) ?? {}
    for (const ca of componentAnimations) {
      const key = ca.componentSelector ?? ca.componentType ?? ca.componentKey ?? 'component'
      compAnims[key] = {
        preset:        ca.animationPreset,
        intensity:     ca.intensity,
        durationMs:    ca.durationMs,
        delayMs:       ca.delayMs,
        staggerMs:     ca.staggerMs,
        easing:        ca.easing,
        mobileEnabled: ca.mobileEnabled,
      }
      appliedComponentAnimations++
    }
    config.componentAnimations = compAnims
    config.performance = aiPlan.performanceRules ?? config.performance ?? {}
    config.sourcePlanId = plan.id

    if (await saveSectionConfig(sectionId, config)) {
      appliedSectionAnimations = appliedSectionAnimations || 1
    }
  }

  // ── Apply: PAGE scope ────────────────────────────────────────────────────
  if (scope === 'page' && plan.site_page_id) {
    const pageId = plan.site_page_id

    // Load all sections on this page
    const { data: pageSections } = await supabase
      .from('site_sections')
      .select('id, section_type, animation_config' as 'id')
      .eq('page_id', pageId)
      .eq('tenant_id', tenantId) as unknown as { data: Array<{ id: string; section_type: string; animation_config: unknown }> | null }

    for (const sec of pageSections ?? []) {
      const secId   = sec.id as string
      const secType = sec.section_type as string

      const rawConf = (sec as unknown as Record<string, unknown>)?.animation_config
      const config: Record<string, unknown> = (rawConf && typeof rawConf === 'object' && !Array.isArray(rawConf))
        ? { ...rawConf as Record<string, unknown> }
        : makeAnimConfig()

      // Best matching section-level animation
      const secAnim = sectionAnimations.find(a =>
        a.sectionId === secId || a.targetKey === secType || a.targetKey === 'global'
      ) ?? sectionAnimations[0]

      if (secAnim) {
        config.animation = {
          preset:        secAnim.animationPreset,
          intensity:     secAnim.intensity,
          durationMs:    secAnim.durationMs,
          delayMs:       secAnim.delayMs,
          staggerMs:     secAnim.staggerMs,
          easing:        secAnim.easing,
          mobileEnabled: secAnim.mobileEnabled,
        }
        appliedSectionAnimations++
      }

      // Matching style upgrade
      const upgrade = upgrades.find(u =>
        (u.sectionId && u.sectionId === secId) ||
        (u.sectionType && u.sectionType === secType)
      )
      if (upgrade) {
        config.style = {
          stylePreset:     upgrade.stylePreset,
          imageTreatment:  upgrade.imageTreatment,
          buttonTreatment: upgrade.buttonTreatment,
        }
      }

      // Component animations — attach to each section
      const compAnims: Record<string, unknown> = (config.componentAnimations as Record<string, unknown>) ?? {}
      for (const ca of componentAnimations) {
        // Only attach if this ca is for this section or is generic (no sectionId)
        if (!ca.sectionId || ca.sectionId === secId) {
          const key = ca.componentSelector ?? ca.componentType ?? ca.componentKey ?? 'component'
          compAnims[key] = {
            preset:        ca.animationPreset,
            intensity:     ca.intensity,
            durationMs:    ca.durationMs,
            delayMs:       ca.delayMs,
            staggerMs:     ca.staggerMs,
            easing:        ca.easing,
            mobileEnabled: ca.mobileEnabled,
          }
          appliedComponentAnimations++
        }
      }
      config.componentAnimations = compAnims
      config.performance  = aiPlan.performanceRules ?? config.performance ?? {}
      config.sourcePlanId = plan.id

      await saveSectionConfig(secId, config)
    }

    // Page-level animation config (for page animations + global component animations)
    const pageAnimConfig: Record<string, unknown> = {
      v: 1, enabled: true,
      style: aiPlan.globalStyle ?? {},
      animations: pageAnimations.map(a => ({
        preset:        a.animationPreset,
        intensity:     a.intensity,
        durationMs:    a.durationMs,
        delayMs:       a.delayMs,
        easing:        a.easing,
        mobileEnabled: a.mobileEnabled,
        reason:        a.reason,
      })),
      globalComponentAnimations: {} as Record<string, unknown>,
      performance: aiPlan.performanceRules ?? {},
      sourcePlanId: plan.id,
    }
    // Component animations without a sectionId go into globalComponentAnimations
    for (const ca of componentAnimations) {
      if (!ca.sectionId) {
        const key = ca.componentSelector ?? ca.componentType ?? ca.componentKey ?? 'component'
        ;(pageAnimConfig.globalComponentAnimations as Record<string, unknown>)[key] = {
          preset:        ca.animationPreset,
          intensity:     ca.intensity,
          durationMs:    ca.durationMs,
          easing:        ca.easing,
          mobileEnabled: ca.mobileEnabled,
        }
      }
    }
    appliedPageAnimations += pageAnimations.length

    const { error: pageErr } = await supabase
      .from('site_pages')
      .update({ animation_config: pageAnimConfig as never, style_config: pageAnimConfig as never, updated_at: now } as never)
      .eq('id', pageId)
      .eq('tenant_id', tenantId)
    if (pageErr) errors.push(`Page update failed: ${pageErr.message}`)
  }

  // ── Apply: GLOBAL scope ─────────────────────────────────────────────────────
  if (scope === 'global') {
    const { data: allSections } = await supabase
      .from('site_sections')
      .select('id, section_type, animation_config' as 'id')
      .eq('tenant_id', tenantId)
      .eq('is_visible', true) as unknown as { data: Array<{ id: string; section_type: string; animation_config: unknown }> | null }

    for (const sec of allSections ?? []) {
      const secId   = sec.id as string
      const secType = sec.section_type as string

      const rawConf = (sec as unknown as Record<string, unknown>)?.animation_config
      const config: Record<string, unknown> = (rawConf && typeof rawConf === 'object' && !Array.isArray(rawConf))
        ? { ...rawConf as Record<string, unknown> }
        : makeAnimConfig()

      // Find matching section animation
      const secAnim = sectionAnimations.find(a =>
        a.sectionId === secId || a.targetKey === secType || a.targetKey === 'global'
      ) ?? sectionAnimations[0] ?? filteredAnimations[0]

      if (secAnim) {
        config.animation = {
          preset:        secAnim.animationPreset,
          intensity:     secAnim.intensity,
          durationMs:    secAnim.durationMs,
          delayMs:       secAnim.delayMs,
          staggerMs:     secAnim.staggerMs,
          easing:        secAnim.easing,
          mobileEnabled: secAnim.mobileEnabled,
        }
        appliedSectionAnimations++
      }

      const upgrade = upgrades.find(u =>
        (u.sectionId && u.sectionId === secId) ||
        (u.sectionType && u.sectionType === secType)
      )
      if (upgrade) {
        config.style = {
          stylePreset:     upgrade.stylePreset,
          imageTreatment:  upgrade.imageTreatment,
          buttonTreatment: upgrade.buttonTreatment,
        }
      }

      const compAnims: Record<string, unknown> = (config.componentAnimations as Record<string, unknown>) ?? {}
      for (const ca of componentAnimations) {
        if (!ca.sectionId || ca.sectionId === secId) {
          const key = ca.componentSelector ?? ca.componentType ?? ca.componentKey ?? 'component'
          compAnims[key] = {
            preset:        ca.animationPreset,
            intensity:     ca.intensity,
            durationMs:    ca.durationMs,
            delayMs:       ca.delayMs,
            staggerMs:     ca.staggerMs,
            easing:        ca.easing,
            mobileEnabled: ca.mobileEnabled,
          }
          appliedComponentAnimations++
        }
      }
      config.componentAnimations = compAnims
      config.performance  = aiPlan.performanceRules ?? {}
      config.sourcePlanId = plan.id

      await saveSectionConfig(secId, config)
    }

    // Save global style + page animations to tenant record
    const globalConfig = {
      v: 1, enabled: true,
      style:       aiPlan.globalStyle ?? {},
      performance: aiPlan.performanceRules ?? {},
      pageAnimations: pageAnimations.map(a => ({
        preset: a.animationPreset, intensity: a.intensity, durationMs: a.durationMs,
        easing: a.easing, mobileEnabled: a.mobileEnabled, reason: a.reason,
      })),
      sourcePlanId: plan.id,
    }
    appliedPageAnimations += pageAnimations.length

    const { error: tenantErr } = await supabase
      .from('tenants')
      .update({ website_animation_config: globalConfig as never } as never)
      .eq('id', tenantId)
    if (tenantErr) errors.push(`Tenant update failed: ${tenantErr.message}`)
  }

  // Track skipped animations (those that didn't match any section)
  for (const a of filteredAnimations) {
    const applied =
      (a.targetType === 'page') ||
      (a.targetType === 'section' && appliedSectionAnimations > 0) ||
      (a.targetType === 'component' && appliedComponentAnimations > 0)
    if (!applied) {
      skippedAnimations.push({ key: a.targetKey ?? 'unknown', reason: 'No matching section found' })
    }
  }

  // ── Mark plan as applied ───────────────────────────────────────────────────
  await supabase
    .from('website_animation_plans')
    .update({ status: 'applied', applied_at: now, updated_at: now } as never)
    .eq('id', planId)

  return NextResponse.json({
    ok:    errors.length === 0,
    planId,
    scope,
    appliedPageAnimations,
    appliedSectionAnimations,
    appliedComponentAnimations,
    totalApplied: appliedPageAnimations + appliedSectionAnimations + appliedComponentAnimations,
    skippedAnimations: skippedAnimations.length ? skippedAnimations : undefined,
    warnings:  warnings.length ? warnings : undefined,
    errors:    errors.length ? errors : undefined,
    message:   errors.length
      ? `Applied with ${errors.length} error(s).`
      : `Applied: ${appliedSectionAnimations} section, ${appliedComponentAnimations} component, ${appliedPageAnimations} page animations.${warnings.length ? ` (${warnings.length} intensity value(s) normalized)` : ''}`,
  })
}
