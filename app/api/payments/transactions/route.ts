// app/api/payments/transactions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ── GET /api/payments/transactions ───────────────────────────────────────────
export async function GET(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const dashUser = await resolveStoreUser(req)
  if (dashUser && ['admin', 'owner'].includes(dashUser.role)) {
    const tenantId = dashUser.role === 'owner'
      ? (req.nextUrl.searchParams.get('tenant_id') ?? dashUser.tenant_id)
      : dashUser.tenant_id

    const statusFilter = req.nextUrl.searchParams.get('status')
    const limit        = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? '100'), 200)

    let query = supabase
      .from('payment_transactions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (statusFilter) query = query.eq('status', statusFilter)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ transactions: data ?? [] })
  }

  // Customer: own transactions only
  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.customer_id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ transactions: data ?? [] })
}
