// app/api/rewards/redemptions/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { redeemRewardItem } from '@/lib/rewards/redeemRewardItem'

// ─── GET /api/rewards/redemptions ─────────────────────────────────────────────
// admin/owner → all redemptions for tenant
// customer   → their own redemptions
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient()

  const dashUser = await resolveStoreUser(req)
  if (dashUser && (dashUser.role === 'admin' || dashUser.role === 'owner')) {
    const tenantId = dashUser.role === 'owner'
      ? (req.nextUrl.searchParams.get('tenant_id') ?? dashUser.tenant_id)
      : dashUser.tenant_id

    const { data, error } = await supabase
      .from('reward_redemptions')
      .select('*, reward_shop_items(name, redemption_type), customers(name, email)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ redemptions: data })
  }

  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('*, reward_shop_items(name, redemption_type)')
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.customer_id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ redemptions: data })
}

// ─── POST /api/rewards/redemptions ────────────────────────────────────────────
// customer only — redeem a shop item
export async function POST(req: NextRequest) {
  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized — customer login required' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { item_id } = body
  if (typeof item_id !== 'string' || !item_id) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
  }

  const result = await redeemRewardItem({
    tenantId:   customer.tenant_id,
    customerId: customer.customer_id,
    itemId:     item_id,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({
    redemption_id: result.redemption_id,
    points_used:   result.points_used,
    new_balance:   result.new_balance,
  }, { status: 201 })
}
