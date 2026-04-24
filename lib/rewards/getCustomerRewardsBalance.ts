// lib/rewards/getCustomerRewardsBalance.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { RewardsBalance } from '@/types/rewards'

/**
 * Returns the rewards balance for a customer within a tenant.
 * Returns null if no balance record exists yet (customer has no points).
 */
export async function getCustomerRewardsBalance(
  tenantId:   string,
  customerId: string,
): Promise<RewardsBalance | null> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('rewards_balances')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error) {
    console.error('[getCustomerRewardsBalance]', error.message)
    return null
  }

  return data as RewardsBalance | null
}

/**
 * Returns a zero-balance object when no balance record exists.
 * Safe to use directly in UI without null checks.
 */
export async function getCustomerRewardsBalanceSafe(
  tenantId:   string,
  customerId: string,
): Promise<RewardsBalance> {
  const balance = await getCustomerRewardsBalance(tenantId, customerId)

  return balance ?? {
    id:                       '',
    tenant_id:                tenantId,
    customer_id:              customerId,
    points_balance:           0,
    lifetime_points_earned:   0,
    lifetime_points_redeemed: 0,
    updated_at:               new Date().toISOString(),
    created_at:               new Date().toISOString(),
  }
}

/**
 * Returns all customer balances for admin view, joined with customer info.
 */
export async function getAllCustomerBalances(tenantId: string) {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('rewards_balances')
    .select('*, customers(id, name, email)')
    .eq('tenant_id', tenantId)
    .order('points_balance', { ascending: false })

  if (error) {
    console.error('[getAllCustomerBalances]', error.message)
    return []
  }

  return data ?? []
}
