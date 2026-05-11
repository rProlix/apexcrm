// app/api/website/ai/animations/apply/route.ts
// POST /api/website/ai/animations/apply
// Converts a validated AI animation plan into safe animation_config/style_config
// and applies it to site_sections, site_pages, or tenants.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { ValidatedAiAnimationPlan } from '@/lib/website/animations/validateAnimationConfig'
import type { WebsiteAnimationPlan } from '@/lib/website/animations/types'

const bodySchema = z.object({
  planId:                z.string().uuid(),
  applyScope:            z.enum(['global', 'page', 'section']).optional(),
  selectedAnimationKeys: z.array(z.string()).optional(), // empty = apply all
})

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

  const aiPlan = plan.ai_plan as Partial<ValidatedAiAnimationPlan>
  const animations = aiPlan.animations ?? []
  const upgrades   = aiPlan.sectionUpgrades ?? []
  const scope      = body.applyScope ?? plan.scope

  // Filter to selected animations if specified
  const filteredAnimations = selectedAnimationKeys?.length
    ? animations.filter(a => selectedAnimationKeys.includes(a.targetKey))
    : animations

  const now = new Date().toISOString()
  const errors: string[] = []

  // ── Apply: section scope ────────────────────────────────────────────────────
  if (scope === 'section' && plan.site_section_id) {
    const sectionAnim = filteredAnimations.find(a =>
      a.targetType === 'section' || a.targetKey !== 'global'
    )
    const sectionUpgrade = upgrades[0]

    const animationConfig = {
      v:       1,
      enabled: true,
      animation: sectionAnim ? {
        preset:        sectionAnim.animationPreset,
        intensity:     sectionAnim.intensity,
        durationMs:    sectionAnim.durationMs,
        delayMs:       sectionAnim.delayMs,
        staggerMs:     sectionAnim.staggerMs,
        easing:        sectionAnim.easing,
        mobileEnabled: sectionAnim.mobileEnabled,
      } : {},
      style: sectionUpgrade ? {
        stylePreset:     sectionUpgrade.stylePreset,
        imageTreatment:  sectionUpgrade.imageTreatment,
        buttonTreatment: sectionUpgrade.buttonTreatment,
      } : {},
      performance: aiPlan.performanceRules ?? {},
      sourcePlanId: plan.id,
    }

    const { error: secErr } = await supabase
      .from('site_sections')
      .update({ animation_config: animationConfig as never, updated_at: now } as never)
      .eq('id', plan.site_section_id)

    if (secErr) errors.push(`Section update failed: ${secErr.message}`)
  }

  // ── Apply: page scope ────────────────────────────────────────────────────────
  if ((scope === 'page' || scope === 'global') && plan.site_page_id) {
    // Apply to each section on this page
    const { data: pageSections } = await supabase
      .from('site_sections')
      .select('id, section_type')
      .eq('page_id', plan.site_page_id)

    for (const sec of pageSections ?? []) {
      const anim = filteredAnimations.find(a =>
        a.targetKey === sec.section_type || a.targetKey === 'global'
      )
      const upgrade = upgrades.find(u => u.sectionType === sec.section_type)

      const config = {
        v:       1,
        enabled: true,
        animation: anim ? {
          preset:        anim.animationPreset,
          intensity:     anim.intensity,
          durationMs:    anim.durationMs,
          delayMs:       anim.delayMs,
          staggerMs:     anim.staggerMs,
          easing:        anim.easing,
          mobileEnabled: anim.mobileEnabled,
        } : {},
        style: upgrade ? {
          stylePreset:     upgrade.stylePreset,
          imageTreatment:  upgrade.imageTreatment,
          buttonTreatment: upgrade.buttonTreatment,
        } : {},
        performance: aiPlan.performanceRules ?? {},
        sourcePlanId: plan.id,
      }

      const { error: secErr } = await supabase
        .from('site_sections')
        .update({ animation_config: config as never, updated_at: now } as never)
        .eq('id', sec.id)
      if (secErr) errors.push(`Section ${sec.id}: ${secErr.message}`)
    }

    // Store style on page
    const pageStyle = {
      v:       1,
      enabled: true,
      style:   aiPlan.globalStyle ?? {},
      sourcePlanId: plan.id,
    }
    const { error: pageErr } = await supabase
      .from('site_pages')
      .update({ animation_config: pageStyle as never, style_config: pageStyle as never, updated_at: now } as never)
      .eq('id', plan.site_page_id)
    if (pageErr) errors.push(`Page update failed: ${pageErr.message}`)
  }

  // ── Apply: global scope ─────────────────────────────────────────────────────
  if (scope === 'global') {
    // Apply to ALL sections across the tenant
    const { data: allSections } = await supabase
      .from('site_sections')
      .select('id, section_type')
      .eq('tenant_id', plan.tenant_id)
      .eq('is_visible', true)

    for (const sec of allSections ?? []) {
      const anim = filteredAnimations.find(a =>
        a.targetKey === sec.section_type || a.targetKey === 'global'
      ) ?? filteredAnimations[0]
      const upgrade = upgrades.find(u => u.sectionType === sec.section_type)

      const config = {
        v:       1,
        enabled: true,
        animation: anim ? {
          preset:        anim.animationPreset,
          intensity:     anim.intensity,
          durationMs:    anim.durationMs,
          delayMs:       anim.delayMs,
          staggerMs:     anim.staggerMs,
          easing:        anim.easing,
          mobileEnabled: anim.mobileEnabled,
        } : { preset: 'fade_up' },
        style: upgrade ? {
          stylePreset:     upgrade.stylePreset,
          imageTreatment:  upgrade.imageTreatment,
          buttonTreatment: upgrade.buttonTreatment,
        } : {},
        performance: aiPlan.performanceRules ?? {},
        sourcePlanId: plan.id,
      }

      const { error: sErr } = await supabase
        .from('site_sections')
        .update({ animation_config: config as never, updated_at: now } as never)
        .eq('id', sec.id)
      if (sErr) errors.push(`Section ${sec.id}: ${sErr.message}`)
    }

    // Store global style on tenant
    const globalConfig = {
      v:           1,
      enabled:     true,
      style:       aiPlan.globalStyle ?? {},
      performance: aiPlan.performanceRules ?? {},
      sourcePlanId: plan.id,
    }
    const { error: tenantErr } = await supabase
      .from('tenants')
      .update({ website_animation_config: globalConfig as never } as never)
      .eq('id', plan.tenant_id)
    if (tenantErr) errors.push(`Tenant update failed: ${tenantErr.message}`)
  }

  // ── Mark plan as applied ───────────────────────────────────────────────────
  await supabase
    .from('website_animation_plans')
    .update({ status: 'applied', applied_at: now, updated_at: now } as never)
    .eq('id', planId)

  return NextResponse.json({
    ok:       errors.length === 0,
    planId,
    scope,
    errors:   errors.length ? errors : undefined,
    message:  errors.length
      ? `Applied with ${errors.length} error(s).`
      : 'Animation plan applied successfully.',
  })
}
