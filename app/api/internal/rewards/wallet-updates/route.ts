import { NextRequest, NextResponse } from 'next/server'
import { processPendingWalletUpdates } from '@/lib/rewards/wallet/registrations'
import { getAppleWalletConfigurationStatus } from '@/lib/rewards/wallet/config'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!getAppleWalletConfigurationStatus().configured) {
    return NextResponse.json({ ok: true, skipped: 'APPLE_WALLET_NOT_CONFIGURED' })
  }
  return NextResponse.json({ ok: true, ...(await processPendingWalletUpdates()) })
}
