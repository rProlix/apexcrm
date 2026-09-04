import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import { AppleWalletUnavailableError, issueAppleWalletPass } from '@/lib/rewards/wallet/service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const customer = await resolveStoreCustomer(request)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const program = await getRewardsProgram(customer.tenant_id)
  if (!program || !program.wallet_enabled) {
    return NextResponse.json(
      { error: 'Apple Wallet is not enabled for this rewards program' },
      { status: 409 }
    )
  }
  try {
    const issued = await issueAppleWalletPass({
      tenantId: customer.tenant_id,
      customerId: customer.customer_id,
      programId: program.id,
    })
    return new NextResponse(new Uint8Array(issued.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.pkpass',
        'Content-Disposition': `attachment; filename="rewards-${issued.serialNumber}.pkpass"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    if (error instanceof AppleWalletUnavailableError) {
      return NextResponse.json(
        { error: error.message, code: 'APPLE_WALLET_NOT_CONFIGURED' },
        { status: 503 }
      )
    }
    console.error('[rewards:wallet] pass generation failed', { kind: 'pass_generation' })
    return NextResponse.json({ error: 'Unable to generate Apple Wallet pass' }, { status: 500 })
  }
}
