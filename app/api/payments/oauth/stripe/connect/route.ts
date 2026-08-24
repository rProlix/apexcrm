import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { createOpaqueOAuthState, persistOAuthState } from '@/lib/payments/oauth/stateStore'
import { StripeIntegrationError } from '@/lib/payments/stripe/errors'
import {
  getStripeClientId,
  sanitizeStripeReturnPath,
  stripeCallbackUrl,
  stripePaymentsUrl,
} from '@/lib/payments/stripe/server'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const context = await getUserContext()
  if (!context) {
    return NextResponse.redirect(stripePaymentsUrl({ error: 'authorization_required' }))
  }
  if (!['owner', 'admin'].includes(context.role) || !context.tenant_id) {
    if (context.tenant_id) {
      await recordCommandAudit({
        tenantId: context.tenant_id,
        actorUserId: context.id,
        action: 'stripe.connect.unauthorized',
        metadata: { role: context.role },
      })
    }
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const state = createOpaqueOAuthState()
    const returnPath = sanitizeStripeReturnPath(req.nextUrl.searchParams.get('return_to'))
    await persistOAuthState({
      state,
      tenantId: context.tenant_id,
      userId: context.id,
      provider: 'stripe',
      returnPath,
    })

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: getStripeClientId(),
      scope: 'read_write',
      redirect_uri: stripeCallbackUrl(),
      state,
    })
    await recordCommandAudit({
      tenantId: context.tenant_id,
      actorUserId: context.id,
      action: 'stripe.connect.started',
      metadata: { return_path: returnPath },
    })
    return NextResponse.redirect(`https://connect.stripe.com/oauth/authorize?${params}`)
  } catch (error) {
    const safeCode =
      error instanceof StripeIntegrationError ? error.safeCode : 'configuration_unavailable'
    console.error('[stripe:connect] initiation failed', {
      tenant_id: context.tenant_id,
      user_id: context.id,
      category: error instanceof StripeIntegrationError ? error.category : 'UNKNOWN_PROVIDER_ERROR',
    })
    await recordCommandAudit({
      tenantId: context.tenant_id,
      actorUserId: context.id,
      action: 'stripe.connect.failed',
      metadata: { error_code: safeCode },
    })
    return NextResponse.redirect(stripePaymentsUrl({ error: safeCode }))
  }
}
