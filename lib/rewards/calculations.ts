import type { RewardEvent } from './engine'

export function calculateRulePoints(rule: Record<string, unknown>, event: RewardEvent): number {
  if (rule.minimum_spend != null && (event.amount ?? 0) < Number(rule.minimum_spend)) return 0
  let points = Number(rule.points_awarded ?? 0)
  if (rule.earning_basis === 'spend') {
    const threshold = Math.max(Number(rule.amount_threshold ?? 1), 0.01)
    const units = Math.floor((event.amount ?? 0) / threshold)
    points =
      rule.points_per_currency != null
        ? Math.floor((event.amount ?? 0) * Number(rule.points_per_currency))
        : units * Number(rule.points_awarded ?? 0)
  }
  if (rule.earning_basis === 'product' && Array.isArray(rule.eligible_product_ids)) {
    const eligible = new Set(rule.eligible_product_ids as string[])
    const quantity = (event.items ?? [])
      .filter((item) => eligible.has(item.product_id))
      .reduce((sum, item) => sum + item.quantity, 0)
    points *= quantity
  }
  return Math.max(0, Math.min(points, Number(rule.maximum_per_event ?? Number.MAX_SAFE_INTEGER)))
}

export function applyPointModifiers(
  base: number,
  tierMultiplier: number,
  promotions: Array<{ rule_type: string; multiplier?: number | null; bonus_points?: number | null }>
) {
  let multiplier = Math.max(0, tierMultiplier)
  let bonus = 0
  for (const promotion of promotions) {
    if (promotion.rule_type === 'multiplier') multiplier *= Number(promotion.multiplier ?? 1)
    if (promotion.rule_type === 'bonus_points') bonus += Number(promotion.bonus_points ?? 0)
  }
  return Math.max(0, Math.floor(base * multiplier + bonus))
}

export function selectQualifiedTier<T extends { threshold: number; qualification_type: string }>(
  tiers: T[],
  points: number
) {
  return (
    [...tiers]
      .sort((a, b) => Number(b.threshold) - Number(a.threshold))
      .find((tier) => tier.qualification_type === 'points' && points >= Number(tier.threshold)) ??
    null
  )
}
