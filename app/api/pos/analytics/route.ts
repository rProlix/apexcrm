// app/api/pos/analytics/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner','manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const days    = parseInt(req.nextUrl.searchParams.get('days') ?? '30', 10)
  const supabase = getPOSClient()

  const { data, error } = await supabase.rpc('get_pos_analytics', {
    p_tenant_id: user.tenant_id,
    p_days:      days,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ analytics: data })
}
