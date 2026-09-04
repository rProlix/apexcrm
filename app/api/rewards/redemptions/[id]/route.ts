// app/api/rewards/redemptions/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { recordCommandAudit } from '@/lib/command-center/audit'

type Params = { params: Promise<{ id: string }> }

// ─── GET /api/rewards/redemptions/[id] ───────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('reward_redemptions')
    .select('*, reward_shop_items(name, redemption_type), customers(name, email)')
    .eq('id', (await params).id)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ redemption: data })
}

// ─── PATCH /api/rewards/redemptions/[id] ─────────────────────────────────────
// admin/owner - claim, redeem, or cancel a redemption.
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { status } = body
  const validStatuses = ['claimed', 'redeemed', 'cancelled']
  if (typeof status !== 'string' || !validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `status must be one of: ${validStatuses.join(', ')}` },
      { status: 400 }
    )
  }

  const supabase = getSupabaseServerClient() as any
  const redemptionId = (await params).id
  const { data: existing } = await supabase
    .from('reward_redemptions')
    .select('*')
    .eq('id', redemptionId)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (status === 'redeemed') {
    const { data: completed, error } = await supabase.rpc('complete_reward_redemption', {
      p_tenant_id: user.tenant_id,
      p_redemption_id: redemptionId,
      p_actor_id: user.id,
      p_idempotency_key: `admin:${redemptionId}:redeemed`,
    })
    if (error || !completed)
      return NextResponse.json({ error: 'Redemption is expired or already used' }, { status: 409 })
    await recordCommandAudit({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      action: 'rewards.reward_redeemed',
      metadata: { redemption_id: redemptionId, customer_id: existing.customer_id },
    })
    return NextResponse.json({ redemption: { ...existing, status: 'redeemed' } })
  }

  if (status === 'cancelled') {
    const { data: cancelled, error } = await supabase.rpc('cancel_reward_redemption', {
      p_tenant_id: user.tenant_id,
      p_redemption_id: redemptionId,
      p_actor_id: user.id,
      p_idempotency_key: `admin:${redemptionId}:cancelled`,
    })
    if (error || !cancelled)
      return NextResponse.json({ error: 'Redemption is already final' }, { status: 409 })
    await recordCommandAudit({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      action: 'rewards.reward_cancelled',
      metadata: { redemption_id: redemptionId, customer_id: existing.customer_id },
    })
    return NextResponse.json({ redemption: { ...existing, status: 'cancelled' } })
  }

  const { data, error } = await supabase
    .from('reward_redemptions')
    .update({
      status,
      claimed_at: status === 'claimed' ? new Date().toISOString() : existing.claimed_at,
      updated_at: new Date().toISOString(),
    })
    .eq('id', redemptionId)
    .eq('tenant_id', user.tenant_id)
    .in('status', ['available', 'claimed'])
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/rewards/redemptions/[id]]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await recordCommandAudit({
    tenantId: user.tenant_id,
    actorUserId: user.id,
    action: 'rewards.reward_claimed',
    metadata: { redemption_id: redemptionId, customer_id: existing.customer_id },
  })

  return NextResponse.json({ redemption: data })
}
