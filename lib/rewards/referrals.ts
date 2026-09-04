import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function claimReferral(input: {
  tenantId: string
  referredCustomerId: string
  referralCode: string
}) {
  const db = getSupabaseServerClient() as any
  const { data: membership } = await db
    .from('reward_memberships')
    .select('customer_id,program_id')
    .eq('tenant_id', input.tenantId)
    .eq('referral_code', input.referralCode.trim().toUpperCase())
    .eq('status', 'active')
    .maybeSingle()
  if (!membership) throw new Error('Referral code is invalid')
  if (membership.customer_id === input.referredCustomerId)
    throw new Error('You cannot use your own referral code')
  const { data: config } = await db
    .from('reward_referral_programs')
    .select('*')
    .eq('tenant_id', input.tenantId)
    .eq('program_id', membership.program_id)
    .eq('enabled', true)
    .maybeSingle()
  if (!config) throw new Error('Referrals are not enabled')
  const { data, error } = await db
    .from('reward_referrals')
    .insert({
      tenant_id: input.tenantId,
      referral_program_id: config.id,
      referrer_customer_id: membership.customer_id,
      referred_customer_id: input.referredCustomerId,
      referral_code: `${input.referralCode.trim().toUpperCase()}-${input.referredCustomerId.slice(0, 8)}`,
      status: config.qualification_type === 'signup' ? 'qualified' : 'pending',
      qualified_at: config.qualification_type === 'signup' ? new Date().toISOString() : null,
    })
    .select('*')
    .single()
  if (error)
    throw new Error(
      error.code === '23505'
        ? 'This customer has already used a referral'
        : 'Unable to claim referral'
    )
  if (config.qualification_type === 'signup') await rewardQualifiedReferral(data.id)
  return data
}

export async function qualifyCustomerReferrals(input: {
  tenantId: string
  customerId: string
  sourceType: 'first_purchase' | 'first_appointment'
  sourceId: string
}) {
  const db = getSupabaseServerClient() as any
  const { data: referrals } = await db
    .from('reward_referrals')
    .select('id,reward_referral_programs!inner(qualification_type)')
    .eq('tenant_id', input.tenantId)
    .eq('referred_customer_id', input.customerId)
    .eq('status', 'pending')
  for (const referral of referrals ?? []) {
    if (referral.reward_referral_programs?.qualification_type !== input.sourceType) continue
    const { data } = await db
      .from('reward_referrals')
      .update({
        status: 'qualified',
        qualified_at: new Date().toISOString(),
        qualification_source_type: input.sourceType,
        qualification_source_id: input.sourceId,
      })
      .eq('tenant_id', input.tenantId)
      .eq('id', referral.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle()
    if (data) await rewardQualifiedReferral(data.id)
  }
}

export async function rewardQualifiedReferral(referralId: string) {
  const db = getSupabaseServerClient() as any
  const { data: referral } = await db
    .from('reward_referrals')
    .select('*,reward_referral_programs!inner(*)')
    .eq('id', referralId)
    .eq('status', 'qualified')
    .maybeSingle()
  if (!referral) return false
  const config = referral.reward_referral_programs
  const awards = [
    {
      customerId: referral.referrer_customer_id,
      points: Number(config.referrer_points),
      side: 'referrer',
    },
    {
      customerId: referral.referred_customer_id,
      points: Number(config.referred_points),
      side: 'referred',
    },
  ]
  for (const award of awards) {
    if (!award.customerId || award.points <= 0) continue
    const { error } = await db.rpc('apply_reward_points', {
      p_tenant_id: referral.tenant_id,
      p_customer_id: award.customerId,
      p_program_id: config.program_id,
      p_transaction_type: 'referral',
      p_points_delta: award.points,
      p_source_type: 'referral',
      p_source_id: referral.id,
      p_idempotency_key: `referral:${referral.id}:${award.side}`,
      p_description: 'Referral reward',
      p_metadata: { side: award.side },
    })
    if (error) throw new Error(`Referral reward failed: ${error.code}`)
  }
  await db
    .from('reward_referrals')
    .update({ status: 'rewarded', rewarded_at: new Date().toISOString() })
    .eq('id', referral.id)
    .eq('tenant_id', referral.tenant_id)
  return true
}
