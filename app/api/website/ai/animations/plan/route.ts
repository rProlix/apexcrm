// app/api/website/ai/animations/plan/route.ts
// POST /api/website/ai/animations/plan
// Uses Gemini to create a structured AI animation + premium UI design plan.
//
// FLOW: load sections → build prompt with real UUIDs → call Gemini
//       → parse JSON → normalize (map labels → UUIDs) → safety strip
//       → Zod validate → save → return

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { callGeminiText } from '@/lib/ai/geminiRequest'
import { validateAiAnimationPlan } from '@/lib/website/animations/validateAnimationConfig'
import { normalizePremiumDesignPlan, safeStripSectionIds } from '@/lib/website/ai/normalizePremiumDesignPlan'
import { ANIMATION_PRESETS, STYLE_PRESETS, IMAGE_TREATMENTS, BUTTON_TREATMENTS } from '@/lib/website/animations/types'
import type { AnimationScope, AnimationIntensity, AnimationPerformance, DesiredVibe } from '@/lib/website/animations/types'

const bodySchema = z.object({
  tenantId:                z.string().uuid(),
  pageId:                  z.string().uuid().optional().nullable(),
  sectionId:               z.string().uuid().optional().nullable(),
  scope:                   z.enum(['global', 'page', 'section']).default('section'),
  desiredVibe:             z.enum(['luxury','modern_saas','warm_local','editorial_boutique','futuristic_premium','clean_professional','bold_conversion']).optional(),
  intensity:               z.enum(['subtle','balanced','cinematic']).optional().default('balanced'),
  performanceMode:         z.enum(['fast','balanced','premium']).optional().default('balanced'),
  includeMobileAnimations: z.boolean().optional().default(true),
})

const GEMINI_ANIMATION_MODEL =
  process.env.GEMINI_ANIMATION_MODEL?.trim() ||
  process.env.WEBSITE_AI_GEMINI_MODEL?.trim() ||
  'gemini-2.0-flash-exp'

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request body', detail: String(err) }, { status: 400 })
  }

  const { tenantId, pageId, sectionId, scope, desiredVibe, intensity, performanceMode, includeMobileAnimations } = body

  if (!process.env.GEMINI_API_KEY)
    return NextResponse.json({ error: 'GEMINI_API_KEY is not configured.' }, { status: 503 })

  const supabase = getSupabaseServerClient()

  // ── Verify tenant access ────────────────────────────────────────────────────
  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id, role')
    .eq('auth_user_id', ctx.auth_id)
    .in('role', ['owner', 'admin'])
    .single()
  if (!userRow || userRow.tenant_id !== tenantId)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  // ── Load business context ───────────────────────────────────────────────────
  const { data: tenant } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .single() as { data: Record<string, unknown> | null; error: unknown }

  // ── Load sections — STEP 1: get real UUIDs to include in prompt ─────────────
  let sectionsQuery = supabase
    .from('site_sections')
    .select('id, section_type, content, sort_order, page_id')
    .eq('tenant_id', tenantId)
    .eq('is_visible', true)
    .order('sort_order')
    .limit(30)

  if (sectionId && scope === 'section') {
    sectionsQuery = supabase
      .from('site_sections')
      .select('id, section_type, content, sort_order, page_id')
      .eq('id', sectionId)
  } else if (pageId && scope === 'page') {
    sectionsQuery = supabase
      .from('site_sections')
      .select('id, section_type, content, sort_order, page_id')
      .eq('page_id', pageId)
      .eq('is_visible', true)
      .order('sort_order')
  }

  const { data: sections } = await sectionsQuery

  // Build availableSections for normalization and prompt
  const availableSections = (sections ?? []).map(s => {
    const c = (typeof s.content === 'object' && s.content !== null ? s.content : {}) as Record<string, unknown>
    return {
      id:     s.id,
      type:   s.section_type as string | null,
      title:  String(c.headline ?? c.title ?? s.section_type ?? '').slice(0, 80) || null,
      name:   null,
      order:  s.sort_order as number | null,
      pageId: (s as Record<string, unknown>).page_id as string | null ?? null,
    }
  })

  const availableSectionIds = new Set(availableSections.map(s => s.id))

  // Load theme/brand settings
  const { data: websiteSettings } = await supabase
    .from('website_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle() as { data: Record<string, unknown> | null; error: unknown }

  const businessContext = {
    businessName:    String(tenant?.name ?? 'The Business'),
    businessType:    String(tenant?.business_type ?? tenant?.industry ?? 'general'),
    description:     String(tenant?.description ?? ''),
    primaryColor:    websiteSettings?.primary_color ? String(websiteSettings.primary_color) : null,
    fontFamily:      websiteSettings?.font_family ? String(websiteSettings.font_family) : null,
    tagline:         websiteSettings?.site_tagline ? String(websiteSettings.site_tagline) : null,
    scope,
    desiredVibe:     desiredVibe ?? 'clean_professional',
    intensity:       intensity ?? 'balanced',
    performanceMode: performanceMode ?? 'balanced',
    includeMobile:   includeMobileAnimations,
    sections:        availableSections,
  }

  // ── Build the Gemini prompt ─────────────────────────────────────────────────
  const vibeMap: Record<string, string> = {
    luxury:             'ultra-high-end, editorial, exclusivity, quiet luxury',
    modern_saas:        'sleek, tech-forward, precision, futuristic minimalism',
    warm_local:         'friendly, approachable, community-focused, trustworthy local business',
    editorial_boutique: 'artisan, curated, boutique, editorial photography vibes',
    futuristic_premium: 'cutting-edge, bold, glowing accents, dark mode premium',
    clean_professional: 'clean, trustworthy, organized, business-ready',
    bold_conversion:    'high-contrast, urgency, CTA-focused, action-driving',
  }
  const vibeDescription = vibeMap[desiredVibe ?? 'clean_professional'] ?? 'clean and professional'

  // Sections formatted for the prompt — include real UUIDs
  const sectionList = availableSections.map(s =>
    `  { "id": "${s.id}", "type": "${s.type ?? ''}", "title": "${s.title ?? ''}" }`
  ).join(',\n')

  const prompt = `You are a luxury website creative director and Framer Motion animation designer.

BUSINESS:
- Name: ${businessContext.businessName}
- Type: ${businessContext.businessType}
- Desired vibe: ${vibeDescription}
- Animation intensity: ${intensity}
- Performance mode: ${performanceMode}
- Scope: ${scope}

WEBSITE SECTIONS (${availableSections.length} sections):
[
${sectionList || '  (no sections yet)'}
]

BRAND:
- Primary color: ${businessContext.primaryColor ?? 'not set'}
- Font: ${businessContext.fontFamily ?? 'not set'}
- Tagline: ${businessContext.tagline ?? 'not set'}

CRITICAL SECTION ID RULES:
You are given the exact website sections above. For every item in "sectionUpgrades":
- sectionId MUST be exactly one of the "id" UUID values listed above.
- Do NOT invent sectionId values.
- Do NOT use labels like "hero", "features", "about", or "testimonials" as sectionId.
- If you are unsure which section matches, set sectionId to null and use sectionType to describe it.
- It is perfectly valid to set sectionId: null. The backend will handle null gracefully.

TASK: Create a premium animation and UI design plan. Match the animation style to the business type:
- Plumbing/contractor: trustworthy, clean, fast — NO gimmicky effects
- Salon/beauty: elegant, soft, editorial — smooth reveals
- Restaurant: warm, cinematic — gentle motion
- SaaS/tech: sleek, futuristic, precise — micro-interactions
- Boutique/luxury: editorial, slow, refined — luxury parallax

RULES:
1. Do NOT over-animate. Prioritize conversion, readability, speed, mobile.
2. Output ONLY valid JSON. No markdown. No code blocks. No extra text.
3. Use ONLY these animation presets: ${ANIMATION_PRESETS.join(', ')}
4. Use ONLY these style presets: ${STYLE_PRESETS.filter(s => s !== 'none').join(', ')}
5. Use ONLY these image treatments: ${IMAGE_TREATMENTS.filter(t => t !== 'none').join(', ')} (or "none")
6. Use ONLY these button treatments: ${BUTTON_TREATMENTS.filter(b => b !== 'standard').join(', ')} (or "standard")
7. Colors must be hex (e.g. #7c3aed). No rgb(), hsl(), or named colors.
8. Duration: 100–3000ms. Delay: 0–2000ms. Stagger: 0–800ms.
9. respectReducedMotion must always be true.
10. Include a clear "reason" for each animation.
11. ${intensity === 'subtle' ? 'Keep all animations very subtle.' : intensity === 'cinematic' ? 'Make animations dramatic and premium.' : 'Balance animation quality with subtlety.'}

Return JSON matching EXACTLY this schema:
{
  "summary": "1-2 sentence description of the premium design direction",
  "globalStyle": {
    "visualTier": "clean" | "premium" | "luxury" | "ultra_luxury",
    "mood": "modern" | "warm" | "bold" | "minimal" | "editorial" | "futuristic",
    "recommendedPalette": {
      "primary": "#hex",
      "accent": "#hex",
      "background": "#hex",
      "surface": "#hex",
      "text": "#hex"
    },
    "typographyTone": "minimal" | "editorial" | "luxury" | "tech" | "friendly",
    "surfaceStyle": "flat" | "glass" | "soft_shadow" | "premium_card" | "editorial"
  },
  "animations": [
    {
      "targetType": "section",
      "targetKey": "hero",
      "animationPreset": "hero_cinematic",
      "intensity": "balanced",
      "durationMs": 700,
      "delayMs": 0,
      "staggerMs": 80,
      "easing": "luxury",
      "mobileEnabled": true,
      "reason": "Reason this animation improves conversion"
    }
  ],
  "sectionUpgrades": [
    {
      "sectionId": "<USE EXACT UUID FROM SECTIONS LIST ABOVE, OR null>",
      "sectionType": "hero",
      "stylePreset": "luxury_hero",
      "layoutRecommendation": "string",
      "imageTreatment": "soft_gradient_overlay",
      "buttonTreatment": "premium_glow",
      "notes": "string"
    }
  ],
  "performanceRules": {
    "avoidHeavyAnimationsOnMobile": true,
    "respectReducedMotion": true,
    "lazyLoadBelowFold": true,
    "maxAnimatedElementsPerViewport": 8
  }
}

Return ONLY the JSON. No markdown fences. No extra text.`

  // ── Call Gemini ─────────────────────────────────────────────────────────────
  const { text, error: aiError } = await callGeminiText({
    model:           GEMINI_ANIMATION_MODEL,
    prompt,
    feature:         'animation-planner',
    temperature:     0.4,
    maxOutputTokens: 4096,
    timeoutMs:       60_000,
  })

  if (aiError || !text) {
    await supabase.from('website_animation_plans').insert({
      tenant_id:                 tenantId,
      site_page_id:              pageId ?? null,
      site_section_id:           sectionId ?? null,
      created_by:                ctx.auth_id ?? null,
      status:                    'failed',
      scope,
      desired_vibe:              desiredVibe ?? null,
      intensity:                 (intensity as AnimationIntensity) ?? null,
      performance_mode:          (performanceMode as AnimationPerformance) ?? null,
      include_mobile_animations: includeMobileAnimations,
      business_context:          businessContext as never,
      error_message:             aiError ?? 'AI returned no content',
    } as never)

    return NextResponse.json({
      error: aiError ?? 'AI returned no content.',
    }, { status: 500 })
  }

  // ── Parse raw JSON from Gemini ──────────────────────────────────────────────
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

  if (!rawPlan || typeof rawPlan !== 'object') {
    return NextResponse.json({ error: 'AI returned unparseable response.' }, { status: 500 })
  }

  // ── STEP 1: Normalize — map labels to real UUIDs or null ────────────────────
  const normalizedPlan = normalizePremiumDesignPlan(rawPlan, availableSections, {
    selectedSectionId: sectionId ?? null,
    scope,
  })

  // ── STEP 2: Safety strip — final guard before Zod ──────────────────────────
  const safePlan = safeStripSectionIds(normalizedPlan, availableSectionIds)

  // ── STEP 3: Zod validation ──────────────────────────────────────────────────
  const { plan: validatedPlan, error: validationError } = validateAiAnimationPlan(safePlan)

  if (!validatedPlan) {
    // Log detailed error for debugging but don't expose internals
    console.error('[AI-ANIM][plan] Validation failed after normalization:', validationError)

    const { data: failedPlan } = await supabase
      .from('website_animation_plans')
      .insert({
        tenant_id:                 tenantId,
        site_page_id:              pageId ?? null,
        site_section_id:           sectionId ?? null,
        created_by:                ctx.auth_id ?? null,
        status:                    'failed',
        scope,
        desired_vibe:              desiredVibe ?? null,
        intensity:                 (intensity as AnimationIntensity) ?? null,
        performance_mode:          (performanceMode as AnimationPerformance) ?? null,
        include_mobile_animations: includeMobileAnimations,
        business_context:          businessContext as never,
        ai_plan:                   safePlan as never,
        error_message:             validationError ?? 'Plan validation failed',
      } as never)
      .select('id')
      .single() as { data: { id: string } | null; error: unknown }

    return NextResponse.json({
      error: validationError ?? 'AI plan validation failed.',
      planId: (failedPlan as { id: string } | null)?.id,
    }, { status: 500 })
  }

  // ── STEP 4: Save validated plan ─────────────────────────────────────────────
  const { data: plan, error: insertErr } = await supabase
    .from('website_animation_plans')
    .insert({
      tenant_id:                 tenantId,
      site_page_id:              pageId ?? null,
      site_section_id:           sectionId ?? null,
      created_by:                ctx.auth_id ?? null,
      status:                    'planned',
      scope,
      desired_vibe:              desiredVibe ?? null,
      intensity:                 (intensity as AnimationIntensity) ?? null,
      performance_mode:          (performanceMode as AnimationPerformance) ?? null,
      include_mobile_animations: includeMobileAnimations,
      business_context:          businessContext as never,
      ai_plan:                   validatedPlan as never,
    } as never)
    .select('*')
    .single()

  if (insertErr) {
    console.error('[AI-ANIM][plan] Insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ plan, aiPlan: validatedPlan })
}
