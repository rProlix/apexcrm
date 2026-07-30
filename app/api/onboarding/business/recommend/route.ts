export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { OnboardingAnswers } from '@/lib/plans/planCatalog'
import {
  calculateSignupQuote,
  getRecommendedSignupModules,
  getSignupPackageForBusinessType,
  SIGNUP_MODULE_OFFERS,
} from '@/lib/plans/signupModulePricing'

/**
 * POST /api/onboarding/business/recommend
 *
 * Receives onboarding answers and returns the recommended plan,
 * recommended modules, all available plan cards, and why the plan was chosen.
 * No auth required — pure recommendation logic.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OnboardingAnswers

    const businessType = body.businessCategory ?? body.businessType
    const selectedModules = getRecommendedSignupModules({
      businessType,
      needs: [
        body.needsAppointments && 'appointments',
        body.needsPayments && 'payments',
        body.needsWebsite && 'website',
        body.needsStore && 'store',
        body.needsCustomers && 'customers',
        body.needsRewards && 'rewards',
        body.needsEmailReminders && 'messages',
        body.needs360Products && '360',
      ].filter(Boolean),
      sellsProducts: body.sellsProducts,
      offersServices: body.sellsServices,
    })
    const signupPackage = getSignupPackageForBusinessType(businessType)
    const quote = calculateSignupQuote(selectedModules)
    const recommendationReason = `${signupPackage.name} matches the common workflows for ${businessType || 'your business'}. Every module remains optional, so you can tailor the package and price before creating your workspace.`

    return NextResponse.json({
      success: true,
      recommended: {
        package_key: signupPackage.key,
        recommended_modules: selectedModules,
        recommendation_reason: recommendationReason,
      },
      subscription: {
        package: signupPackage,
        selected_modules: selectedModules,
        module_catalog: SIGNUP_MODULE_OFFERS,
        quote,
        recommendation_reason: recommendationReason,
      },
    })
  } catch (err) {
    console.error('[/api/onboarding/business/recommend] error:', err)
    return NextResponse.json(
      { success: false, error: 'Failed to compute recommendation.' },
      { status: 500 }
    )
  }
}
