import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { claimReferral } from '@/lib/rewards/referrals'
import { checkRewardRateLimit } from '@/lib/rewards/rate-limit'

export async function POST(request: NextRequest) {
  const customer = await resolveStoreCustomer(request)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = checkRewardRateLimit(`referral:${customer.id}`, 10, 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'Too many attempts' }, { status: 429 })
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null
  if (typeof body?.code !== 'string' || body.code.trim().length < 6)
    return NextResponse.json({ error: 'Referral code is required' }, { status: 400 })
  try {
    return NextResponse.json(
      {
        referral: await claimReferral({
          tenantId: customer.tenant_id,
          referredCustomerId: customer.customer_id,
          referralCode: body.code,
        }),
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to claim referral' },
      { status: 422 }
    )
  }
}
