import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { processRewardEvent } from './engine'

export async function runRewardMaintenance(now = new Date()) {
  const db = getSupabaseServerClient() as any
  const iso = now.toISOString()
  const monthDay = iso.slice(5, 10)
  let birthdays = 0
  let expiredPoints = 0

  const { data: birthdayPrograms } = await db
    .from('reward_rules')
    .select('tenant_id,program_id')
    .eq('event_type', 'birthday')
    .eq('enabled', true)
    .or(`starts_at.is.null,starts_at.lte.${iso}`)
    .or(`ends_at.is.null,ends_at.gt.${iso}`)
  for (const scope of birthdayPrograms ?? []) {
    const { data: customers } = await db
      .from('customers')
      .select('id,metadata')
      .eq('tenant_id', scope.tenant_id)
    for (const customer of customers ?? []) {
      const birthday =
        typeof customer.metadata?.birthday === 'string' ? customer.metadata.birthday : null
      if (!birthday || birthday.slice(5, 10) !== monthDay) continue
      const result = await processRewardEvent({
        tenantId: scope.tenant_id,
        customerId: customer.id,
        sourceId: customer.id,
        eventType: 'birthday',
        occurredAt: now,
      })
      if (result.points_earned > 0) birthdays += 1
    }
  }

  const { data: due } = await db
    .from('rewards_transactions')
    .select('*')
    .gt('points_delta', 0)
    .lte('expires_at', iso)
    .limit(1000)
  for (const transaction of due ?? []) {
    const { data: prior } = await db
      .from('rewards_transactions')
      .select('id')
      .eq('tenant_id', transaction.tenant_id)
      .eq('reversed_transaction_id', transaction.id)
      .eq('transaction_type', 'expired')
      .maybeSingle()
    if (prior) continue
    const { data: balance } = await db
      .from('rewards_balances')
      .select('points_balance')
      .eq('tenant_id', transaction.tenant_id)
      .eq('customer_id', transaction.customer_id)
      .maybeSingle()
    const amount = Math.min(Number(transaction.points_delta), Number(balance?.points_balance ?? 0))
    if (amount <= 0) continue
    const { data, error } = await db.rpc('apply_reward_points', {
      p_tenant_id: transaction.tenant_id,
      p_customer_id: transaction.customer_id,
      p_program_id: transaction.program_id,
      p_transaction_type: 'expired',
      p_points_delta: -amount,
      p_source_type: 'expiration',
      p_source_id: transaction.id,
      p_idempotency_key: `expiration:${transaction.id}`,
      p_description: 'Points expired',
      p_metadata: {},
      p_reversed_transaction_id: transaction.id,
    })
    if (!error && data?.[0]?.was_applied) expiredPoints += amount
  }
  const { data: inactivityPrograms } = await db
    .from('rewards_programs')
    .select('id,tenant_id,expiration_policy')
    .eq('status', 'active')
  for (const program of inactivityPrograms ?? []) {
    const policy = program.expiration_policy as { type?: string; days?: number }
    if (policy.type !== 'inactivity' || !Number.isFinite(policy.days) || Number(policy.days) < 1)
      continue
    const cutoff = new Date(now.getTime() - Number(policy.days) * 86_400_000).toISOString()
    const { data: balances } = await db
      .from('rewards_balances')
      .select('customer_id,points_balance')
      .eq('tenant_id', program.tenant_id)
      .gt('points_balance', 0)
    for (const balance of balances ?? []) {
      const { data: latest } = await db
        .from('rewards_transactions')
        .select('id,created_at')
        .eq('tenant_id', program.tenant_id)
        .eq('customer_id', balance.customer_id)
        .eq('program_id', program.id)
        .gt('points_delta', 0)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (!latest || latest.created_at > cutoff) continue
      const amount = Number(balance.points_balance)
      const { data, error } = await db.rpc('apply_reward_points', {
        p_tenant_id: program.tenant_id,
        p_customer_id: balance.customer_id,
        p_program_id: program.id,
        p_transaction_type: 'expired',
        p_points_delta: -amount,
        p_source_type: 'inactivity',
        p_source_id: latest.id,
        p_idempotency_key: `inactivity:${program.id}:${latest.id}`,
        p_description: 'Points expired after inactivity',
        p_metadata: { inactivity_days: policy.days },
        p_reversed_transaction_id: latest.id,
      })
      if (!error && data?.[0]?.was_applied) expiredPoints += amount
    }
  }
  await db
    .from('reward_promotions')
    .update({ status: 'ended', updated_at: iso })
    .eq('status', 'active')
    .lte('ends_at', iso)
  await db
    .from('reward_redemptions')
    .update({ status: 'expired', updated_at: iso })
    .in('status', ['available', 'claimed'])
    .lte('expires_at', iso)
  return { birthdays, expiredPoints }
}
