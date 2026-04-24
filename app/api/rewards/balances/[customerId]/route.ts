// app/api/rewards/balances/[customerId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

type Params = { params: { customerId: string } }

// ─── GET /api/rewards/balances/[customerId] ───────────────────────────────────
// admin/owner only — get a specific customer's balance
export async function GET(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('rewards_balances')
    .select('*, customers(id, name, email)')
    .eq('customer_id', params.customerId)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ balance: data ?? null })
}

// ─── PATCH /api/rewards/balances/[customerId] ─────────────────────────────────
// admin/owner — manual point adjustment
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { points_delta, reason } = body
  if (typeof points_delta !== 'number') {
    return NextResponse.json({ error: 'points_delta (number) is required' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  const { data: newBalance, error: balError } = await supabase
    .rpc('upsert_rewards_balance', {
      p_tenant_id:    user.tenant_id,
      p_customer_id:  params.customerId,
      p_points_delta: points_delta,
    })

  if (balError) {
    console.error('[PATCH /api/rewards/balances/[customerId]]', balError.message)
    return NextResponse.json({ error: balError.message }, { status: 500 })
  }

  // Create transaction record for the manual adjustment
  await supabase.from('rewards_transactions').insert({
    tenant_id:        user.tenant_id,
    customer_id:      params.customerId,
    transaction_type: 'adjusted',
    points_delta:     points_delta,
    source_type:      'admin_adjustment',
    metadata:         { reason: reason ?? 'Manual admin adjustment', adjusted_by: user.id },
  })

  return NextResponse.json({ new_balance: newBalance })
}
