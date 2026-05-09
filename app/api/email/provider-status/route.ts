// app/api/email/provider-status/route.ts
// GET /api/email/provider-status — returns email provider health.
// Owner/admin only. Never returns secret values.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getProviderStatus } from '@/lib/email/config'

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx)                                   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' },    { status: 403 })

  const status = getProviderStatus()
  return NextResponse.json(status)
}
