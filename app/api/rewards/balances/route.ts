// app/api/rewards/balances/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'

// ─── GET /api/rewards/balances ────────────────────────────────────────────────
// admin/owner → all balances for their tenant (with customer info)
// customer   → their own balance only
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient()

  const dashUser = await resolveStoreUser(req)
  if (dashUser && (dashUser.role === 'admin' || dashUser.role === 'owner')) {
    const tenantId = dashUser.role === 'owner'
      ? (req.nextUrl.searchParams.get('tenant_id') ?? dashUser.tenant_id)
      : dashUser.tenant_id

    const { data, error } = await supabase
      .from('rewards_balances')
      .select('*, customers(id, name, email)')
      .eq('tenant_id', tenantId)
      .order('points_balance', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ balances: data })
  }

  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('rewards_balances')
    .select('*')
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.customer_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    balance: data ?? {
      points_balance:           0,
      lifetime_points_earned:   0,
      lifetime_points_redeemed: 0,
    },
  })
}
