import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { ApplyOrderRewardsResult, OrderItemForRewards } from '@/types/rewards'
import { calculatePoints } from './calculatePoints'
import { qualifyCustomerReferrals } from './referrals'
import { applyPointModifiers, calculateRulePoints } from './calculations'
import type { RewardExpirationPolicy } from '@/types/rewards'

export type RewardEventType =
  | 'order_completed'
  | 'payment_confirmed'
  | 'appointment_completed'
  | 'first_appointment'
  | 'birthday'
  | 'referral_qualified'

export interface RewardEvent {
  tenantId: string
  customerId: string
  sourceId: string
  eventType: RewardEventType
  amount?: number
  items?: OrderItemForRewards[]
  serviceIds?: string[]
  locationId?: string | null
  occurredAt?: Date
}

function pointsExpiry(policy: RewardExpirationPolicy | null | undefined, now: Date): string | null {
  if (!policy || policy.type === 'never' || policy.type === 'inactivity') return null
  if (policy.type === 'fixed') {
    const fixed = new Date(policy.date)
    return Number.isNaN(fixed.getTime()) || fixed <= now ? null : fixed.toISOString()
  }
  if (!Number.isFinite(policy.days) || policy.days < 1) return null
  return new Date(now.getTime() + policy.days * 86_400_000).toISOString()
}

export async function processRewardEvent(event: RewardEvent): Promise<ApplyOrderRewardsResult> {
  const db = getSupabaseServerClient() as any
  const now = (event.occurredAt ?? new Date()).toISOString()
  const eventKey =
    event.eventType === 'birthday'
      ? `${event.sourceId}:${(event.occurredAt ?? new Date()).getUTCFullYear()}`
      : event.sourceId
  const { data: programs } = await db
    .from('rewards_programs')
    .select('*')
    .eq('tenant_id', event.tenantId)
    .eq('status', 'active')
    .eq('earning_enabled', true)
    .order('created_at')
    .limit(1)
  let totalPoints = 0
  let latestBalance = 0
  let transactionId = ''
  const punchCardsHit: string[] = []

  for (const program of programs ?? []) {
    const [{ data: rules }, { data: tier }, { data: promotions }] = await Promise.all([
      db
        .from('reward_rules')
        .select('*')
        .eq('tenant_id', event.tenantId)
        .eq('program_id', program.id)
        .eq('event_type', event.eventType)
        .eq('enabled', true)
        .or(`starts_at.is.null,starts_at.lte.${now}`)
        .or(`ends_at.is.null,ends_at.gt.${now}`),
      db
        .from('reward_customer_tiers')
        .select('reward_tiers(points_multiplier)')
        .eq('tenant_id', event.tenantId)
        .eq('customer_id', event.customerId)
        .eq('program_id', program.id)
        .maybeSingle(),
      db
        .from('reward_promotions')
        .select('*')
        .eq('tenant_id', event.tenantId)
        .eq('program_id', program.id)
        .eq('status', 'active')
        .lte('starts_at', now)
        .gt('ends_at', now),
    ])
    const tierMultiplier = Number(tier?.reward_tiers?.points_multiplier ?? 1)
    let programPoints = 0
    if ((rules ?? []).length > 0) {
      for (const rule of rules) {
        const base = calculateRulePoints(rule, event)
        if (base <= 0) continue
        const eligiblePromotions = (promotions ?? []).filter(
          (promotion: any) =>
            promotion.minimum_spend == null ||
            (event.amount ?? 0) >= Number(promotion.minimum_spend)
        )
        const points = applyPointModifiers(base, tierMultiplier, eligiblePromotions)
        const multiplier = eligiblePromotions
          .filter((promotion: any) => promotion.rule_type === 'multiplier')
          .reduce(
            (value: number, promotion: any) => value * Number(promotion.multiplier ?? 1),
            tierMultiplier
          )
        const bonus = eligiblePromotions
          .filter((promotion: any) => promotion.rule_type === 'bonus_points')
          .reduce((value: number, promotion: any) => value + Number(promotion.bonus_points ?? 0), 0)
        const { data, error } = await db.rpc('apply_reward_points', {
          p_tenant_id: event.tenantId,
          p_customer_id: event.customerId,
          p_program_id: program.id,
          p_transaction_type:
            bonus > 0 || multiplier > 1
              ? 'promotion'
              : event.eventType === 'birthday'
                ? 'birthday'
                : event.eventType === 'referral_qualified'
                  ? 'referral'
                  : 'earned',
          p_points_delta: points,
          p_source_type: event.eventType,
          p_source_id: event.sourceId,
          p_idempotency_key: `${event.eventType}:${eventKey}:rule:${rule.id}`,
          p_description: rule.name,
          p_metadata: { rule_id: rule.id, base_points: base, multiplier, bonus },
          p_expires_at: pointsExpiry(program.expiration_policy, event.occurredAt ?? new Date()),
        })
        if (error) throw new Error(`Reward points failed: ${error.code}`)
        const result = data?.[0]
        if (result?.was_applied) programPoints += points
        latestBalance = Number(result?.points_balance ?? latestBalance)
        transactionId ||= result?.transaction_id ?? ''
      }
    } else if (
      event.eventType === 'order_completed' &&
      event.items?.length &&
      program.settings?.points_enabled !== false
    ) {
      const calculation = await calculatePoints(event.tenantId, program.id, event.items)
      if (calculation.total_points > 0) {
        const { data, error } = await db.rpc('apply_reward_points', {
          p_tenant_id: event.tenantId,
          p_customer_id: event.customerId,
          p_program_id: program.id,
          p_transaction_type: 'earned',
          p_points_delta: calculation.total_points,
          p_source_type: 'order',
          p_source_id: event.sourceId,
          p_idempotency_key: `${event.eventType}:${event.sourceId}:legacy:${program.id}`,
          p_description: 'Order completed',
          p_metadata: { breakdown: calculation.breakdown },
          p_expires_at: pointsExpiry(program.expiration_policy, event.occurredAt ?? new Date()),
        })
        if (error) throw new Error(`Order rewards failed: ${error.code}`)
        const result = data?.[0]
        if (result?.was_applied) programPoints += calculation.total_points
        latestBalance = Number(result?.points_balance ?? latestBalance)
        transactionId ||= result?.transaction_id ?? ''
      }
    }
    totalPoints += programPoints

    const earningMethod =
      event.eventType === 'appointment_completed'
        ? 'appointment'
        : event.eventType === 'order_completed'
          ? 'purchase'
          : null
    if (earningMethod) {
      const { data: definitions } = await db
        .from('reward_punch_definitions')
        .select('*')
        .eq('tenant_id', event.tenantId)
        .eq('program_id', program.id)
        .eq('earning_method', earningMethod)
        .eq('enabled', true)
      for (const definition of definitions ?? []) {
        const eligibleProducts = new Set<string>(definition.eligible_product_ids ?? [])
        const eligibleServices = new Set<string>(definition.eligible_service_ids ?? [])
        const qualifies =
          eligibleProducts.size > 0
            ? (event.items ?? []).some((item) => eligibleProducts.has(item.product_id))
            : eligibleServices.size > 0
              ? (event.serviceIds ?? []).some((id) => eligibleServices.has(id))
              : true
        if (!qualifies) continue
        const promotionPunches = (promotions ?? [])
          .filter((promotion: any) => promotion.rule_type === 'bonus_punch')
          .reduce((sum: number, promotion: any) => sum + Number(promotion.bonus_punches ?? 0), 0)
        const punches =
          (eligibleProducts.size > 0
            ? (event.items ?? [])
                .filter((item) => eligibleProducts.has(item.product_id))
                .reduce((sum, item) => sum + item.quantity, 0)
            : 1) + promotionPunches
        const { data, error } = await db.rpc('apply_reward_punch', {
          p_tenant_id: event.tenantId,
          p_customer_id: event.customerId,
          p_definition_id: definition.id,
          p_source_type: event.eventType,
          p_source_id: event.sourceId,
          p_idempotency_key: `${event.eventType}:${event.sourceId}:punch:${definition.id}`,
          p_punches: punches,
          p_metadata: { definition_name: definition.name },
        })
        if (error) throw new Error(`Reward punch failed: ${error.code}`)
        if (data?.[0]?.was_applied) {
          punchCardsHit.push(definition.name)
          if (
            data[0].completed &&
            definition.reward_type === 'bonus_points' &&
            Number(definition.reward_value) > 0
          ) {
            await db.rpc('apply_reward_points', {
              p_tenant_id: event.tenantId,
              p_customer_id: event.customerId,
              p_program_id: program.id,
              p_transaction_type: 'bonus',
              p_points_delta: Math.floor(Number(definition.reward_value)),
              p_source_type: 'punch_card',
              p_source_id: data[0].punch_card_id,
              p_idempotency_key: `punch-complete:${data[0].punch_card_id}:bonus`,
              p_description: `${definition.name} completed`,
              p_metadata: { definition_id: definition.id },
              p_expires_at: pointsExpiry(program.expiration_policy, event.occurredAt ?? new Date()),
            })
          }
        }
      }
    }
    await recalculateCustomerTier(event.tenantId, event.customerId, program.id)
    if (
      event.amount != null &&
      event.amount > 0 &&
      (event.eventType === 'order_completed' || event.eventType === 'appointment_completed')
    ) {
      await db.from('reward_analytics_events').upsert(
        {
          tenant_id: event.tenantId,
          customer_id: event.customerId,
          program_id: program.id,
          event_name: 'reward_attributed_revenue',
          source_type: event.eventType,
          source_id: event.sourceId,
          revenue_amount: event.amount,
          metadata: { points_earned: programPoints },
        },
        { onConflict: 'tenant_id,event_name,source_type,source_id' }
      )
    }
  }
  if (event.eventType === 'order_completed' || event.eventType === 'appointment_completed') {
    await qualifyCustomerReferrals({
      tenantId: event.tenantId,
      customerId: event.customerId,
      sourceType: event.eventType === 'order_completed' ? 'first_purchase' : 'first_appointment',
      sourceId: event.sourceId,
    })
  }
  return {
    points_earned: totalPoints,
    new_balance: latestBalance,
    punch_cards_hit: punchCardsHit,
    transaction_id: transactionId,
  }
}

export async function recalculateCustomerTier(
  tenantId: string,
  customerId: string,
  programId: string
) {
  const db = getSupabaseServerClient() as any
  const rollingSince = new Date(Date.now() - 365 * 86_400_000).toISOString()
  const [
    { data: current },
    { data: balance },
    { data: tiers },
    lifetimeOrders,
    rollingOrders,
    lifetimeAppointments,
    rollingAppointments,
  ] = await Promise.all([
    db
      .from('reward_customer_tiers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('program_id', programId)
      .maybeSingle(),
    db
      .from('rewards_balances')
      .select('lifetime_points_earned')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .maybeSingle(),
    db
      .from('reward_tiers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('program_id', programId)
      .eq('enabled', true)
      .order('threshold', { ascending: false }),
    db
      .from('orders')
      .select('total_amount')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .in('status', ['delivered', 'completed']),
    db
      .from('orders')
      .select('total_amount')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .in('status', ['delivered', 'completed'])
      .gte('created_at', rollingSince),
    db
      .from('appointments')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'completed'),
    db
      .from('appointments')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('status', 'completed')
      .gte('created_at', rollingSince),
  ])
  if (current?.is_manual_override) return current
  const orderMetrics = (rows: any[]) => ({
    purchases: rows.length,
    spend: rows.reduce((sum: number, order: any) => sum + Number(order.total_amount ?? 0), 0),
  })
  const lifetime = orderMetrics(lifetimeOrders.data ?? [])
  const rolling = orderMetrics(rollingOrders.data ?? [])
  const metricFor = (tier: any) => {
    const useRolling = tier.qualification_window === 'rolling_12_months'
    if (tier.qualification_type === 'points') return Number(balance?.lifetime_points_earned ?? 0)
    if (tier.qualification_type === 'spend') return (useRolling ? rolling : lifetime).spend
    if (tier.qualification_type === 'purchases') return (useRolling ? rolling : lifetime).purchases
    const appointmentCount =
      (useRolling ? rollingAppointments.data : lifetimeAppointments.data)?.length ?? 0
    if (tier.qualification_type === 'appointments') return appointmentCount
    return (useRolling ? rolling : lifetime).purchases + appointmentCount
  }
  const target =
    (tiers ?? []).find((tier: any) => metricFor(tier) >= Number(tier.threshold)) ?? null
  if (!target || current?.tier_id === target.id) return current ?? null
  const value = metricFor(target)
  await db.from('reward_customer_tiers').upsert(
    {
      tenant_id: tenantId,
      customer_id: customerId,
      program_id: programId,
      tier_id: target.id,
      qualification_value: value,
      is_manual_override: false,
    },
    { onConflict: 'tenant_id,customer_id,program_id' }
  )
  await db.from('reward_tier_events').insert({
    tenant_id: tenantId,
    customer_id: customerId,
    program_id: programId,
    previous_tier_id: current?.tier_id ?? null,
    tier_id: target.id,
    event_type: current ? 'upgraded' : 'qualified',
  })
  return target
}
