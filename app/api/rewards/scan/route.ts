import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveMembershipBarcode } from '@/lib/rewards/membership'
import { hashRewardToken } from '@/lib/rewards/security'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { checkRewardRateLimit } from '@/lib/rewards/rate-limit'

export async function POST(request: NextRequest) {
  const user = await resolveStoreUser(request)
  if (!user || !['owner', 'admin', 'manager', 'staff'].includes(user.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const rate = checkRewardRateLimit(`scan:${user.id}`, 120, 60_000)
  if (!rate.allowed)
    return NextResponse.json(
      { error: 'Too many scans' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
    )
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const token = typeof body?.token === 'string' ? body.token.trim() : ''
  const action = typeof body?.action === 'string' ? body.action : 'lookup'
  if (!token || token.length > 512)
    return NextResponse.json({ error: 'A valid barcode token is required' }, { status: 400 })
  const db = getSupabaseServerClient() as any

  if (token.startsWith('nex_red_')) {
    const { data: redemption } = await db
      .from('reward_redemptions')
      .select('id,customer_id,status,expires_at,reward_shop_items(name)')
      .eq('tenant_id', user.tenant_id)
      .eq('credential_hash', hashRewardToken(token))
      .maybeSingle()
    if (!redemption) return NextResponse.json({ error: 'Redemption not found' }, { status: 404 })
    if (action !== 'redeem')
      return NextResponse.json({
        kind: 'redemption',
        redemption: {
          id: redemption.id,
          reward_name: redemption.reward_shop_items?.name,
          status: redemption.status,
          expires_at: redemption.expires_at,
        },
      })
    const idempotencyKey =
      typeof body?.idempotency_key === 'string' ? body.idempotency_key : `scan:${redemption.id}`
    const { data: completed } = await db.rpc('complete_reward_redemption', {
      p_tenant_id: user.tenant_id,
      p_redemption_id: redemption.id,
      p_actor_id: user.id,
      p_idempotency_key: idempotencyKey,
    })
    if (!completed)
      return NextResponse.json({ error: 'Redemption is expired or already used' }, { status: 409 })
    await recordCommandAudit({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      action: 'rewards.reward_redeemed',
      metadata: { redemption_id: redemption.id, customer_id: redemption.customer_id },
    })
    return NextResponse.json({ ok: true, kind: 'redemption', status: 'redeemed' })
  }

  const membership = await resolveMembershipBarcode(user.tenant_id, token)
  if (!membership) return NextResponse.json({ error: 'Reward member not found' }, { status: 404 })
  if (action === 'award_points' || action === 'add_punch') {
    if (!['owner', 'admin', 'manager'].includes(user.role))
      return NextResponse.json({ error: 'Manager access is required' }, { status: 403 })
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : ''
    if (reason.length < 3 || reason.length > 240)
      return NextResponse.json(
        { error: 'A reason between 3 and 240 characters is required' },
        { status: 400 }
      )
    const idempotencyKey =
      typeof body?.idempotency_key === 'string'
        ? body.idempotency_key
        : `scanner:${crypto.randomUUID()}`
    if (action === 'award_points') {
      const points = Number(body?.points)
      if (!Number.isInteger(points) || points < 1 || points > 100_000)
        return NextResponse.json(
          { error: 'Points must be a whole number from 1 to 100,000' },
          { status: 400 }
        )
      const { data, error } = await db.rpc('apply_reward_points', {
        p_tenant_id: user.tenant_id,
        p_customer_id: membership.customer_id,
        p_program_id: membership.program_id,
        p_transaction_type: 'adjusted',
        p_points_delta: points,
        p_source_type: 'manual',
        p_source_id: membership.id,
        p_idempotency_key: idempotencyKey,
        p_description: reason,
        p_performed_by: user.id,
        p_metadata: { channel: 'scanner' },
      })
      if (error) return NextResponse.json({ error: 'Unable to award points' }, { status: 422 })
      await recordCommandAudit({
        tenantId: user.tenant_id,
        actorUserId: user.id,
        action: 'rewards.points_awarded_from_scanner',
        metadata: { customer_id: membership.customer_id, points, reason },
      })
      return NextResponse.json({
        ok: true,
        kind: 'membership_action',
        action,
        points_balance: data?.[0]?.points_balance,
      })
    }
    const definitionId = typeof body?.definition_id === 'string' ? body.definition_id : ''
    const punches = Number(body?.punches ?? 1)
    if (!definitionId || !Number.isInteger(punches) || punches < 1 || punches > 25)
      return NextResponse.json(
        { error: 'Choose a punch card and enter 1 to 25 punches' },
        { status: 400 }
      )
    const { data, error } = await db.rpc('apply_reward_punch', {
      p_tenant_id: user.tenant_id,
      p_customer_id: membership.customer_id,
      p_definition_id: definitionId,
      p_source_type: 'manual',
      p_source_id: membership.id,
      p_idempotency_key: idempotencyKey,
      p_punches: punches,
      p_performed_by: user.id,
      p_metadata: { reason, channel: 'scanner' },
    })
    if (error) return NextResponse.json({ error: 'Unable to add punches' }, { status: 422 })
    await recordCommandAudit({
      tenantId: user.tenant_id,
      actorUserId: user.id,
      action: 'rewards.punch_added_from_scanner',
      metadata: {
        customer_id: membership.customer_id,
        definition_id: definitionId,
        punches,
        reason,
      },
    })
    return NextResponse.json({ ok: true, kind: 'membership_action', action, punch_card: data?.[0] })
  }
  const [
    { data: customer },
    { data: balance },
    { data: tier },
    { data: cards },
    { data: rewards },
    { data: punchDefinitions },
  ] = await Promise.all([
    db
      .from('customers')
      .select('name')
      .eq('tenant_id', user.tenant_id)
      .eq('id', membership.customer_id)
      .single(),
    db
      .from('rewards_balances')
      .select('points_balance')
      .eq('tenant_id', user.tenant_id)
      .eq('customer_id', membership.customer_id)
      .maybeSingle(),
    db
      .from('reward_customer_tiers')
      .select('reward_tiers(name)')
      .eq('tenant_id', user.tenant_id)
      .eq('customer_id', membership.customer_id)
      .eq('program_id', membership.program_id)
      .maybeSingle(),
    db
      .from('reward_punch_cards')
      .select('id,definition_id,title,current_punches,punch_goal,status')
      .eq('tenant_id', user.tenant_id)
      .eq('customer_id', membership.customer_id)
      .eq('status', 'active'),
    db
      .from('reward_redemptions')
      .select('id,status,expires_at,reward_shop_items(name)')
      .eq('tenant_id', user.tenant_id)
      .eq('customer_id', membership.customer_id)
      .in('status', ['available', 'claimed']),
    db
      .from('reward_punch_definitions')
      .select('id,name')
      .eq('tenant_id', user.tenant_id)
      .eq('program_id', membership.program_id)
      .eq('enabled', true)
      .in('earning_method', ['manual', 'visit']),
  ])
  return NextResponse.json({
    kind: 'membership',
    member: {
      membership_number: membership.membership_number,
      customer_name: customer?.name ?? 'Rewards member',
      points_balance: Number(balance?.points_balance ?? 0),
      tier: tier?.reward_tiers?.name ?? null,
      punch_cards: cards ?? [],
      punch_definitions: punchDefinitions ?? [],
      available_rewards: rewards ?? [],
    },
  })
}
