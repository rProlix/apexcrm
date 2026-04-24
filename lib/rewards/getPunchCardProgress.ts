// lib/rewards/getPunchCardProgress.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { RewardPunchCard } from '@/types/rewards'

// Re-export client-safe utilities so server callers can import from one place
export { punchCardProgressPercent, punchCardRewardLabel } from './punchCardUtils'

/**
 * Returns all punch cards for a customer in a tenant.
 * Includes product name via join.
 */
export async function getCustomerPunchCards(
  tenantId:   string,
  customerId: string,
): Promise<RewardPunchCard[]> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('reward_punch_cards')
    .select('*, products(name)')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getCustomerPunchCards]', error.message)
    return []
  }

  return (data ?? []) as RewardPunchCard[]
}

/**
 * Returns all active punch cards for a customer.
 */
export async function getActivePunchCards(
  tenantId:   string,
  customerId: string,
): Promise<RewardPunchCard[]> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('reward_punch_cards')
    .select('*, products(name)')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[getActivePunchCards]', error.message)
    return []
  }

  return (data ?? []) as RewardPunchCard[]
}

/**
 * Returns all tenant punch cards (admin view — all customers).
 */
export async function getAllPunchCards(tenantId: string): Promise<RewardPunchCard[]> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('reward_punch_cards')
    .select('*, products(name), customers(name, email)')
    .eq('tenant_id', tenantId)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('[getAllPunchCards]', error.message)
    return []
  }

  return (data ?? []) as RewardPunchCard[]
}

