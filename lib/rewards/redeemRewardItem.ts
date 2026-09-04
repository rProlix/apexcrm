import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getRewardsProgram } from './getRewardsProgram'
import { generateOpaqueToken, hashRewardToken, safeTokenSuffix } from './security'

export interface RedeemResult {
  success: boolean
  error?: string
  redemption_id?: string
  redemption_token?: string
  points_used: number
  new_balance: number
}

export async function redeemRewardItem(params: {
  tenantId: string
  customerId: string
  itemId: string
  idempotencyKey?: string
}): Promise<RedeemResult> {
  const db = getSupabaseServerClient() as any
  const [program, itemResult] = await Promise.all([
    getRewardsProgram(params.tenantId),
    db
      .from('reward_shop_items')
      .select('id,points_cost,program_id')
      .eq('tenant_id', params.tenantId)
      .eq('id', params.itemId)
      .maybeSingle(),
  ])
  if (!program || !program.redemption_enabled || !itemResult.data) {
    return { success: false, error: 'Reward is unavailable', points_used: 0, new_balance: 0 }
  }
  const programId = itemResult.data.program_id ?? program.id
  const credential = `nex_red_${generateOpaqueToken(24)}`
  const idempotencyKey =
    params.idempotencyKey ??
    `redeem:${params.customerId}:${params.itemId}:${generateOpaqueToken(12)}`
  const { data, error } = await db.rpc('redeem_reward_catalog_item', {
    p_tenant_id: params.tenantId,
    p_customer_id: params.customerId,
    p_item_id: params.itemId,
    p_program_id: programId,
    p_credential_hash: hashRewardToken(credential),
    p_credential_last_four: safeTokenSuffix(credential),
    p_idempotency_key: idempotencyKey,
  })
  if (error || !data?.[0]) {
    return {
      success: false,
      error: /insufficient/i.test(error?.message ?? '')
        ? 'Insufficient points'
        : 'Unable to redeem this reward',
      points_used: 0,
      new_balance: 0,
    }
  }
  return {
    success: true,
    redemption_id: data[0].redemption_id,
    redemption_token: credential,
    points_used: Number(itemResult.data.points_cost),
    new_balance: Number(data[0].points_balance),
  }
}
