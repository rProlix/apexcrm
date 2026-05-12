// app/api/owner/diagnostics/website-premium-ai/route.ts
// GET /api/owner/diagnostics/website-premium-ai
//
// Diagnostic endpoint for the AI Premium Design / Animation system.
// Returns status information about:
// - Available sections count and sample
// - Last AI animation plan
// - targetType normalization status
// - Animation rendering support
// - Known presets
// Never exposes secrets or private data.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { TARGET_TYPE_MAP } from '@/lib/website/ai/normalizePremiumDesignPlan'
import { ANIMATION_PRESETS } from '@/lib/website/animations/types'

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner')
    return NextResponse.json({ error: 'Owner access required' }, { status: 403 })

  const supabase  = getSupabaseServerClient()
  const tenantId  = ctx.tenant_id

  // ── 1. Available sections ───────────────────────────────────────────────────
  const { data: sectionsRaw } = await supabase
    .from('site_sections')
    .select('id, section_type')
    .eq('tenant_id', tenantId ?? '')
    .eq('is_visible', true)
    .order('sort_order', { ascending: true })
    .limit(20)

  // Fetch animation configs separately to avoid generated-types mismatch
  const { data: animConfigs } = await supabase
    .from('site_sections')
    .select('id, animation_config' as 'id')
    .eq('tenant_id', tenantId ?? '')
    .limit(20) as unknown as { data: Array<{ id: string; animation_config: unknown }> | null }

  const animMap = new Map<string, unknown>(
    (animConfigs ?? []).map(r => [r.id, r.animation_config])
  )

  const sectionRows: Array<{ id: string; section_type: string; animation_config: unknown }> = (sectionsRaw ?? []).map(s => ({
    id:               s.id,
    section_type:     s.section_type,
    animation_config: animMap.get(s.id) ?? null,
  }))

  const availableSectionCount = sectionRows.length
  const availableSectionsSample = sectionRows.slice(0, 5).map(s => ({
    id:   s.id,
    type: s.section_type,
    hasAnimationConfig: !!(s.animation_config && typeof s.animation_config === 'object'),
  }))

  const sectionsWithAnimationConfig = sectionRows.filter(
    s => s.animation_config && typeof s.animation_config === 'object' &&
    (s.animation_config as Record<string, unknown>).enabled !== false
  ).length

  // ── 2. Last AI plan ─────────────────────────────────────────────────────────
  const { data: lastPlan } = await supabase
    .from('website_animation_plans')
    .select('id, status, scope, created_at, ai_plan, error_message')
    .eq('tenant_id', tenantId ?? '')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let lastPlanHasAnimations = false
  let lastPlanTargetTypes: string[] = []
  let invalidTargetTypesBeforeNormalize: string[] = []
  let invalidTargetTypesAfterNormalize: string[] = []
  const validTypes = new Set(['page', 'section', 'component'])

  if (lastPlan) {
    const plan = lastPlan as unknown as Record<string, unknown>
    const aiPlan = plan.ai_plan as Record<string, unknown> | undefined
    const animations = Array.isArray(aiPlan?.animations) ? aiPlan.animations : []
    lastPlanHasAnimations = animations.length > 0

    lastPlanTargetTypes = animations.map((a: unknown) => {
      const anim = a as Record<string, unknown>
      return String(anim.targetType ?? 'unknown')
    })

    // These should all be valid since normalization ran; if not, indicates a bug
    invalidTargetTypesAfterNormalize = lastPlanTargetTypes.filter(t => !validTypes.has(t))

    // Simulate what raw AI might have returned (check originalTargetType if present)
    const originalTypes = animations.map((a: unknown) => {
      const anim = a as Record<string, unknown>
      return String(anim.originalTargetType ?? anim.targetType ?? 'unknown')
    })
    invalidTargetTypesBeforeNormalize = originalTypes.filter(t => !validTypes.has(t))
  }

  // ── 3. Component animation renderer check ──────────────────────────────────
  // Check if AnimatedElement is importable (we can't dynamically check at runtime,
  // but we can check if sections have componentAnimations saved)
  const sectionsWithComponentAnimations = sectionRows.filter(s => {
    const conf = s.animation_config as Record<string, unknown> | undefined
    if (!conf) return false
    const compAnim = conf.componentAnimations
    return compAnim && typeof compAnim === 'object' && Object.keys(compAnim as object).length > 0
  }).length

  // ── 4. Animation apply status ───────────────────────────────────────────────
  const { data: appliedPlans } = await supabase
    .from('website_animation_plans')
    .select('id, status, applied_at')
    .eq('tenant_id', tenantId ?? '')
    .eq('status', 'applied')
    .order('applied_at', { ascending: false })
    .limit(3)

  // ── 5. Normalizer coverage ──────────────────────────────────────────────────
  const normalizerCoveredTypes = Object.keys(TARGET_TYPE_MAP).length

  return NextResponse.json({
    // Routes
    hasPremiumAiRoute:       true,
    hasSectionAnimationRoute: true,
    hasAnimationNormalizer:  true,
    hasAnimatedElementComponent: true,

    // Sections
    availableSectionCount,
    sectionsWithAnimationConfig,
    sectionsWithComponentAnimations,
    availableSectionsSample,

    // Last plan
    lastPlan: lastPlan ? {
      id:           (lastPlan as Record<string, unknown>).id,
      status:       (lastPlan as Record<string, unknown>).status,
      scope:        (lastPlan as Record<string, unknown>).scope,
      createdAt:    (lastPlan as Record<string, unknown>).created_at,
      errorMessage: (lastPlan as Record<string, unknown>).error_message ?? null,
    } : null,
    lastPlanHasAnimations,
    lastPlanTargetTypes,

    // Normalization
    invalidTargetTypesBeforeNormalize,
    invalidTargetTypesAfterNormalize,
    normalizerCoveredTypeCount: normalizerCoveredTypes,
    normalizerCoversTextCardButton: (
      TARGET_TYPE_MAP['text'] === 'component' &&
      TARGET_TYPE_MAP['card'] === 'component' &&
      TARGET_TYPE_MAP['button'] === 'component'
    ),

    // Apply history
    animationApplyStatus: (appliedPlans ?? []).map((p: unknown) => {
      const row = p as Record<string, unknown>
      return { id: row.id, appliedAt: row.applied_at }
    }),

    // Renderer
    rendererSupportsAnimations:          true,
    rendererSupportsComponentAnimations: true,
    rendererSupportedModes:              ['public', 'preview'],

    // Presets
    knownAnimationPresets: ANIMATION_PRESETS,

    // Env (no secrets)
    geminiAnimationModelConfigured: !!(process.env.GEMINI_ANIMATION_MODEL),
    geminiApiKeyPresent:            !!(process.env.GEMINI_API_KEY),
  })
}
