// lib/rewards/getProductRewardsConfig.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { ProductWithRewards } from '@/types/rewards'

/**
 * Fetches a single product with its rewards configuration.
 * Always scoped to the tenant to prevent cross-tenant reads.
 * Gracefully handles databases where the rewards migration has not been applied.
 */
export async function getProductRewardsConfig(
  productId: string,
  tenantId:  string,
): Promise<ProductWithRewards | null> {
  const supabase = getSupabaseServerClient()

  // Try with rewards columns first (present after 009_rewards.sql migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('products')
    .select('id, tenant_id, name, description, price, currency, inventory_count, is_active, rewards_points_earned, rewards_enabled, rewards_multiplier, created_at')
    .eq('id', productId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    // Rewards columns likely don't exist yet — fall back to base columns
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: fallback } = await (supabase as any)
      .from('products')
      .select('id, tenant_id, name, description, price, currency, inventory_count, is_active, created_at')
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!fallback) return null
    return {
      ...fallback,
      rewards_points_earned: null,
      rewards_enabled:       true,
      rewards_multiplier:    1,
    } as ProductWithRewards
  }

  if (!data) return null

  return {
    ...data,
    rewards_points_earned: data.rewards_points_earned ?? null,
    rewards_enabled:       data.rewards_enabled       ?? true,
    rewards_multiplier:    data.rewards_multiplier     ?? 1,
  } as ProductWithRewards
}

/**
 * Fetches all active products for a tenant with their rewards config.
 * Used by the admin rewards shop item form and the points rule builder.
 * Gracefully handles databases where the rewards migration has not been applied.
 */
export async function getAllProductRewardsConfigs(tenantId: string): Promise<ProductWithRewards[]> {
  const supabase = getSupabaseServerClient()

  // Try with rewards columns first
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('products')
    .select('id, tenant_id, name, description, price, currency, inventory_count, is_active, rewards_points_earned, rewards_enabled, rewards_multiplier, created_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (!error && data) {
    return (data as ProductWithRewards[]).map((p) => ({
      ...p,
      rewards_points_earned: p.rewards_points_earned ?? null,
      rewards_enabled:       p.rewards_enabled       ?? true,
      rewards_multiplier:    p.rewards_multiplier     ?? 1,
    }))
  }

  // Rewards columns don't exist yet — fall back to base columns only
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: fallback } = await (supabase as any)
    .from('products')
    .select('id, tenant_id, name, description, price, currency, inventory_count, is_active, created_at')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('name', { ascending: true })

  return ((fallback ?? []) as ProductWithRewards[]).map((p) => ({
    ...p,
    rewards_points_earned: null,
    rewards_enabled:       true,
    rewards_multiplier:    1,
  }))
}
