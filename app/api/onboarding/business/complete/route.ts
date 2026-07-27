export const dynamic = 'force-dynamic'

import { NextResponse }             from 'next/server'
import { createSessionServerClient } from '@/lib/supabase/server'
import {
  completeBusinessOnboarding,
  type OnboardingData,
} from '@/lib/onboarding/businessOnboarding'
import type { CRMPlanKey } from '@/lib/plans/planCatalog'
import { validateLegalAgreement } from '@/lib/legal/consent'
import { recordLegalConsent } from '@/lib/legal/recordConsent'

/**
 * POST /api/onboarding/business/complete
 *
 * Requires an authenticated session.
 * Creates the tenant, applies plan modules, saves onboarding response,
 * and creates the subscription. Returns a redirect URL.
 */
export async function POST(request: Request) {
  try {
    const sessionClient = await createSessionServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated.' },
        { status: 401 }
      )
    }

    const body = await request.json() as Omit<OnboardingData, 'authUserId'>

    const legalValidation = validateLegalAgreement(body.legalAgreement, 'business_admin')
    if (!legalValidation.ok) {
      return NextResponse.json(
        { success: false, error: legalValidation.error },
        { status: 400 }
      )
    }

    // Validate required fields
    if (!body.businessName?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Business name is required.' },
        { status: 400 }
      )
    }

    const validPlanKeys: CRMPlanKey[] = ['starter', 'growth', 'pro', 'enterprise']
    if (!validPlanKeys.includes(body.selectedPlanKey)) {
      return NextResponse.json(
        { success: false, error: 'Invalid plan key.' },
        { status: 400 }
      )
    }

    const result = await completeBusinessOnboarding({
      ...body,
      legalAgreement: legalValidation.agreement,
      authUserId: user.id,
      email:      user.email ?? body.email,
    })

    await recordLegalConsent({
      authUserId: user.id,
      tenantId: result.tenantId,
      subjectEmail: user.email ?? body.email,
      accountType: 'business_admin',
      agreement: legalValidation.agreement,
      source: 'business_signup',
      request,
      metadata: {
        authority_to_bind_business: true,
        business_name: body.businessName,
      },
    })

    const params = new URLSearchParams({
      slug: result.tenantSlug,
      name: body.businessName,
    })

    return NextResponse.json({
      success:        true,
      tenantId:       result.tenantId,
      tenantSlug:     result.tenantSlug,
      planKey:        result.planKey,
      enabledModules: result.enabledModules,
      lockedModules:  result.lockedModules,
      redirectUrl:    `/onboarding?${params.toString()}`,
    })
  } catch (err) {
    console.error('[/api/onboarding/business/complete] error:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to complete onboarding.' },
      { status: 500 }
    )
  }
}
