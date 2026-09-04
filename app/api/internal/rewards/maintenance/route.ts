import { NextRequest, NextResponse } from 'next/server'
import { runRewardMaintenance } from '@/lib/rewards/maintenance'

export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET
  if (!expected || request.headers.get('authorization') !== `Bearer ${expected}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ ok: true, ...(await runRewardMaintenance()) })
}
