export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { PLAN_CATALOG, MODULE_CATALOG, type CRMPlanKey } from '@/lib/plans/planCatalog'

/**
 * GET /api/plans
 *
 * Returns all active plans with included modules and module catalog.
 * Public endpoint — no auth required.
 */
export async function GET() {
  try {
    const plans = (Object.values(PLAN_CATALOG) as typeof PLAN_CATALOG[CRMPlanKey][])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((p) => ({
        key:                         p.key,
        name:                        p.name,
        description:                 p.description,
        price_monthly_cents:         p.price_monthly_cents,
        price_yearly_cents:          p.price_yearly_cents,
        is_custom:                   p.is_custom,
        badge:                       p.badge,
        included_modules:            p.included_modules,
        highlight_features:          p.highlight_features,
        limits:                      p.limits,
        includes_custom_domain:      p.includes_custom_domain,
        includes_white_label_email:  p.includes_white_label_email,
        includes_ai_builder:         p.includes_ai_builder,
        includes_advanced_analytics: p.includes_advanced_analytics,
      }))

    return NextResponse.json({
      success: true,
      plans,
      modules: MODULE_CATALOG,
    })
  } catch (err) {
    console.error('[/api/plans] error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to load plans.' },
      { status: 500 }
    )
  }
}
