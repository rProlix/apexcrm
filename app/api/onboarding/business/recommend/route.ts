export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import {
  recommendBusinessPlan,
  PLAN_CATALOG,
  type OnboardingAnswers,
  type CRMPlanKey,
} from '@/lib/plans/planCatalog'

/**
 * POST /api/onboarding/business/recommend
 *
 * Receives onboarding answers and returns the recommended plan,
 * recommended modules, all available plan cards, and why the plan was chosen.
 * No auth required — pure recommendation logic.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as OnboardingAnswers

    const recommendation = recommendBusinessPlan(body)

    const plans = (Object.values(PLAN_CATALOG) as typeof PLAN_CATALOG[CRMPlanKey][])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        key:                        p.key,
        name:                       p.name,
        description:                p.description,
        price_monthly_cents:        p.price_monthly_cents,
        price_yearly_cents:         p.price_yearly_cents,
        is_custom:                  p.is_custom,
        badge:                      p.badge,
        is_recommended:             p.key === recommendation.recommended_plan_key,
        included_modules:           p.included_modules,
        highlight_features:         p.highlight_features,
        limits:                     p.limits,
        includes_custom_domain:     p.includes_custom_domain,
        includes_white_label_email: p.includes_white_label_email,
        includes_ai_builder:        p.includes_ai_builder,
        includes_advanced_analytics: p.includes_advanced_analytics,
      }))

    return NextResponse.json({
      success:     true,
      recommended: recommendation,
      plans,
    })
  } catch (err) {
    console.error('[/api/onboarding/business/recommend] error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to compute recommendation.' },
      { status: 500 }
    )
  }
}
