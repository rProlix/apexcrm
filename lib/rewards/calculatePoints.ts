// lib/rewards/calculatePoints.ts
import type {
  OrderItemForRewards,
  EarningRules,
  PointsCalculationResult,
  PointsBreakdownItem,
  ProductWithRewards,
} from '@/types/rewards'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getEarningRules } from './getRewardsProgram'

/**
 * Calculates points for a single order item using product rewards config and
 * tenant earning rules.
 *
 * Priority:
 *  1. product.rewards_points_earned (custom per-unit points from store config)
 *  2. bonus_points_products entry in earning rules
 *  3. default points_per_dollar × item price × quantity
 *
 * Applies rewards_multiplier from the product config.
 * Returns 0 if rewards_enabled is false on the product.
 */
function calculatePointsForItem(
  item:          OrderItemForRewards,
  product:       ProductWithRewards,
  earningRules:  EarningRules,
): PointsBreakdownItem {
  const base: Omit<PointsBreakdownItem, 'points' | 'source'> = {
    product_id:   product.id,
    product_name: product.name,
    quantity:     item.quantity,
  }

  if (!product.rewards_enabled) {
    return { ...base, points: 0, source: 'default' }
  }

  const multiplier = product.rewards_multiplier ?? 1

  // Priority 1: custom per-unit points set on the product itself
  if (product.rewards_points_earned != null && product.rewards_points_earned > 0) {
    return {
      ...base,
      points: Math.floor(product.rewards_points_earned * item.quantity * multiplier),
      source: 'custom',
    }
  }

  // Priority 2: product-specific bonus in earning rules
  const bonusEntry = (earningRules.bonus_points_products ?? []).find(
    (b) => b.product_id === product.id,
  )
  if (bonusEntry) {
    return {
      ...base,
      points: Math.floor(bonusEntry.bonus_points * item.quantity * multiplier),
      source: 'bonus',
    }
  }

  // Priority 3: points per dollar
  const pointsPerDollar = earningRules.points_per_dollar ?? 10
  return {
    ...base,
    points: Math.floor(pointsPerDollar * Number(item.price) * item.quantity * multiplier),
    source: 'default',
  }
}

/**
 * Calculates total points earned for a set of order items.
 *
 * Fetches product rewards config and tenant earning rules.
 * Returns a full breakdown so the caller can audit what was awarded.
 *
 * Returns zero points when:
 *  - no active rewards program exists (falls back to default rules)
 *  - earning_rules.enabled is false
 *  - all products have rewards_enabled = false
 */
export async function calculatePoints(
  tenantId:  string,
  programId: string | null,
  items:     OrderItemForRewards[],
): Promise<PointsCalculationResult> {
  if (!items.length) {
    return { total_points: 0, breakdown: [], program_id: programId }
  }

  const supabase = getSupabaseServerClient()

  // Load earning rules (falls back to defaults if no program)
  const earningRules = await getEarningRules(tenantId)

  if (earningRules.enabled === false) {
    return { total_points: 0, breakdown: [], program_id: programId }
  }

  // Fetch all product configs in one query
  const productIds = [...new Set(items.map((i) => i.product_id))]
  const { data: productsRaw } = await supabase
    .from('products')
    .select('id, tenant_id, name, description, price, currency, inventory_count, is_active, rewards_points_earned, rewards_enabled, rewards_multiplier, created_at')
    .in('id', productIds)
    .eq('tenant_id', tenantId)

  const products = (productsRaw ?? []) as ProductWithRewards[]
  const productMap = new Map(products.map((p) => [p.id, p]))

  const breakdown: PointsBreakdownItem[] = []

  for (const item of items) {
    const product = productMap.get(item.product_id)
    if (!product) continue
    breakdown.push(calculatePointsForItem(item, product, earningRules))
  }

  const total_points = breakdown.reduce((sum, b) => sum + b.points, 0)

  return { total_points, breakdown, program_id: programId }
}

/**
 * Quick estimate of points for a dollar amount. Used in UI previews.
 * Does not account for product-specific rules.
 */
export function estimatePointsForAmount(
  amount:        number,
  earningRules:  EarningRules,
): number {
  if (earningRules.enabled === false) return 0
  return Math.floor((earningRules.points_per_dollar ?? 10) * amount)
}
