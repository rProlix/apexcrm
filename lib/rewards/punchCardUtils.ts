// lib/rewards/punchCardUtils.ts
// Pure utility functions for punch card display — no server imports, safe for client components.
import type { RewardPunchCard } from '@/types/rewards'

/**
 * Computes the percentage progress of a punch card (0–100).
 */
export function punchCardProgressPercent(card: RewardPunchCard): number {
  if (card.punch_goal <= 0) return 100
  return Math.min(100, Math.round((card.current_punches / card.punch_goal) * 100))
}

/**
 * Returns a human-readable reward label for a punch card.
 */
export function punchCardRewardLabel(card: RewardPunchCard): string {
  switch (card.reward_type) {
    case 'free_item':    return 'Free item'
    case 'percent_off':  return `${card.reward_value ?? 0}% off`
    case 'fixed_off':    return `$${card.reward_value ?? 0} off`
    case 'bonus_points': return `${card.reward_value ?? 0} bonus points`
    default:             return 'Reward'
  }
}
