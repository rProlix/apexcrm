import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getVanDamageConfigPresence } from '@/lib/server/env'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Owner or admin access required' }, { status: 403 })
  }
  const checks = getVanDamageConfigPresence()
  const ok = Object.entries(checks)
    .filter(([key]) => key !== 'geminiModel')
    .every(([, value]) => value === true)
  return NextResponse.json({ ok, checks })
}
