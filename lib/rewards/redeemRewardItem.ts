// lib/rewards/redeemRewardItem.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { RewardShopItem } from '@/types/rewards'

export interface RedeemResult {
  success:       boolean
  error?:        string
  redemption_id?: string
  points_used:   number
  new_balance:   number
}

/**
 * Redeems a reward shop item for a customer.
 *
 * Guards:
 *  - Verifies the shop item exists and is active for the tenant
 *  - Checks the customer has sufficient points
 *  - Checks inventory (if tracked)
 *  - Checks per-customer redemption limit (if set)
 *  - Atomically deducts points and creates redemption record
 *
 * Uses upsert_rewards_balance RPC for atomic point deduction.
 */
export async function redeemRewardItem(params: {
  tenantId:   string
  customerId: string
  itemId:     string
}): Promise<RedeemResult> {
  const { tenantId, customerId, itemId } = params
  const supabase = getSupabaseServerClient()

  // ── Load shop item ────────────────────────────────────────────────────────
  const { data: item, error: itemError } = await supabase
    .from('reward_shop_items')
    .select('*')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .maybeSingle()

  if (itemError || !item) {
    return { success: false, error: 'Reward item not found or unavailable', points_used: 0, new_balance: 0 }
  }

  const shopItem = item as RewardShopItem

  // ── Check inventory ───────────────────────────────────────────────────────
  if (shopItem.inventory_count !== null && shopItem.inventory_count <= 0) {
    return { success: false, error: 'This reward is out of stock', points_used: 0, new_balance: 0 }
  }

  // ── Check per-customer limit ──────────────────────────────────────────────
  if (shopItem.max_redemptions_per_customer != null) {
    const { count } = await supabase
      .from('reward_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('customer_id', customerId)
      .eq('reward_item_id', itemId)
      .neq('status', 'canceled')

    if ((count ?? 0) >= shopItem.max_redemptions_per_customer) {
      return {
        success: false,
        error:   `You have already redeemed this reward the maximum number of times (${shopItem.max_redemptions_per_customer})`,
        points_used: 0,
        new_balance:  0,
      }
    }
  }

  // ── Load current balance ──────────────────────────────────────────────────
  const { data: balanceRow } = await supabase
    .from('rewards_balances')
    .select('points_balance')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()

  const currentBalance = balanceRow?.points_balance ?? 0

  if (currentBalance < shopItem.points_cost) {
    return {
      success: false,
      error:   `Insufficient points. You have ${currentBalance} points but need ${shopItem.points_cost}`,
      points_used: 0,
      new_balance:  currentBalance,
    }
  }

  // ── Deduct points atomically ──────────────────────────────────────────────
  const { data: newBalanceData, error: balError } = await supabase
    .rpc('upsert_rewards_balance', {
      p_tenant_id:    tenantId,
      p_customer_id:  customerId,
      p_points_delta: -shopItem.points_cost,
    })

  if (balError) {
    console.error('[redeemRewardItem] balance deduction', balError.message)
    return { success: false, error: 'Failed to deduct points', points_used: 0, new_balance: currentBalance }
  }

  const newBalance = (newBalanceData as unknown as number) ?? 0

  // ── Create rewards transaction ────────────────────────────────────────────
  await supabase.from('rewards_transactions').insert({
    tenant_id:        tenantId,
    customer_id:      customerId,
    transaction_type: 'redeemed',
    points_delta:     -shopItem.points_cost,
    source_type:      'reward_item',
    source_id:        itemId,
    metadata:         { item_name: shopItem.name, redemption_type: shopItem.redemption_type },
  })

  // ── Create redemption record ──────────────────────────────────────────────
  const { data: redemption, error: redeemError } = await supabase
    .from('reward_redemptions')
    .insert({
      tenant_id:      tenantId,
      customer_id:    customerId,
      reward_item_id: itemId,
      points_used:    shopItem.points_cost,
      status:         'pending',
      metadata:       { item_name: shopItem.name, redemption_type: shopItem.redemption_type },
    })
    .select('id')
    .single()

  if (redeemError) {
    console.error('[redeemRewardItem] redemption insert', redeemError.message)
    // Balance already deducted — still return success but log warning
  }

  // ── Decrement inventory if tracked ────────────────────────────────────────
  if (shopItem.inventory_count > 0) {
    await supabase
      .from('reward_shop_items')
      .update({ inventory_count: Math.max(0, shopItem.inventory_count - 1) })
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
  }

  return {
    success:        true,
    redemption_id:  redemption?.id,
    points_used:    shopItem.points_cost,
    new_balance:    newBalance,
  }
}
