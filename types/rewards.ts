// types/rewards.ts
// Shared TypeScript types for the Rewards / Loyalty module.

// ─── Earning Rules ────────────────────────────────────────────────────────────

export interface BonusPointsProduct {
  product_id: string
  bonus_points: number
  product_name?: string
}

export interface EarningRules {
  points_per_dollar?: number
  enabled?: boolean
  bonus_points_products?: BonusPointsProduct[]
}

// ─── Punch Card Rules ─────────────────────────────────────────────────────────

export type PunchCardRewardType = 'free_item' | 'percent_off' | 'fixed_off' | 'bonus_points'

export interface PunchCardRule {
  id: string
  name: string
  product_id: string | null
  product_name?: string
  punch_goal: number
  reward_type: PunchCardRewardType
  reward_value: number | null
  enabled: boolean
}

// ─── Program Settings ─────────────────────────────────────────────────────────

export interface ProgramSettings {
  points_enabled: boolean
  punch_cards_enabled: boolean
  shop_enabled: boolean
  min_redemption_points: number
}

// ─── Rewards Program ──────────────────────────────────────────────────────────

export type RewardsProgramStatus = 'draft' | 'active' | 'paused' | 'archived'
export type RewardsProgramType = 'points' | 'punches' | 'hybrid'

export interface RewardsProgram {
  id: string
  tenant_id: string
  name: string
  description: string | null
  status: RewardsProgramStatus
  program_type?: RewardsProgramType
  currency_display_name?: string
  points_name?: string
  points_abbreviation?: string
  earning_enabled?: boolean
  redemption_enabled?: boolean
  wallet_enabled?: boolean
  expiration_policy?: RewardExpirationPolicy
  branding?: RewardBranding
  earning_rules: EarningRules
  punch_card_rules: PunchCardRule[]
  settings: ProgramSettings
  created_at: string
  updated_at: string
}

// ─── Rewards Balance ──────────────────────────────────────────────────────────

export interface RewardsBalance {
  id: string
  tenant_id: string
  customer_id: string
  points_balance: number
  lifetime_points_earned: number
  lifetime_points_redeemed: number
  updated_at: string
  created_at: string
}

// ─── Rewards Transaction ──────────────────────────────────────────────────────

export type TransactionType =
  | 'earned'
  | 'redeemed'
  | 'adjusted'
  | 'expired'
  | 'bonus'
  | 'refund_reversal'
  | 'promotion'
  | 'referral'
  | 'birthday'
export type SourceType =
  | 'order'
  | 'product'
  | 'manual'
  | 'punch_card'
  | 'reward_item'
  | 'admin_adjustment'

export interface RewardsTransaction {
  id: string
  tenant_id: string
  customer_id: string
  program_id: string | null
  transaction_type: TransactionType
  points_delta: number
  source_type: SourceType | null
  source_id: string | null
  metadata: Record<string, unknown>
  idempotency_key?: string | null
  description?: string | null
  performed_by?: string | null
  expires_at?: string | null
  reversed_transaction_id?: string | null
  created_at: string
}

// ─── Reward Shop Item ─────────────────────────────────────────────────────────

export type RedemptionType = 'discount' | 'free_item' | 'points_only' | 'custom'
export type DiscountType = 'percent' | 'fixed_amount'

export interface RewardShopItem {
  id: string
  tenant_id: string
  name: string
  description: string | null
  points_cost: number
  is_active: boolean
  image_url: string | null
  product_id: string | null
  redemption_type: RedemptionType
  discount_type: DiscountType | null
  discount_value: number | null
  inventory_count: number
  max_redemptions_per_customer: number | null
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined product data (optional)
  product?: { name: string; price: number } | null
}

// ─── Reward Redemption ────────────────────────────────────────────────────────

export type RedemptionStatus = 'available' | 'claimed' | 'redeemed' | 'expired' | 'cancelled'

export interface RewardRedemption {
  id: string
  tenant_id: string
  customer_id: string
  reward_item_id: string | null
  points_used: number
  status: RedemptionStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined
  reward_shop_items?: { name: string; redemption_type: string } | null
}

// ─── Punch Card ───────────────────────────────────────────────────────────────

export type PunchCardStatus = 'active' | 'completed' | 'expired'

export interface RewardPunchCard {
  id: string
  tenant_id: string
  customer_id: string
  product_id: string | null
  title: string
  punch_goal: number
  current_punches: number
  reward_type: PunchCardRewardType
  reward_value: number | null
  status: PunchCardStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  // Joined
  products?: { name: string } | null
}

// ─── Punch Card Event ─────────────────────────────────────────────────────────

export interface RewardPunchCardEvent {
  id: string
  tenant_id: string
  punch_card_id: string
  customer_id: string
  order_id: string | null
  product_id: string | null
  punches_added: number
  metadata: Record<string, unknown>
  created_at: string
}

// ─── Product with Rewards Config ──────────────────────────────────────────────

export interface ProductWithRewards {
  id: string
  tenant_id: string
  name: string
  description: string | null
  price: number
  currency: string
  inventory_count: number
  is_active: boolean
  rewards_points_earned: number | null
  rewards_enabled: boolean
  rewards_multiplier: number
  created_at: string
}

// ─── Order Item (for points calculation) ──────────────────────────────────────

export interface OrderItemForRewards {
  product_id: string
  quantity: number
  price: number
}

// ─── Points Calculation Result ────────────────────────────────────────────────

export interface PointsCalculationResult {
  total_points: number
  breakdown: PointsBreakdownItem[]
  program_id: string | null
}

export interface PointsBreakdownItem {
  product_id: string
  product_name: string
  quantity: number
  points: number
  source: 'custom' | 'bonus' | 'default'
}

// ─── Apply Order Rewards Result ───────────────────────────────────────────────

export interface ApplyOrderRewardsResult {
  points_earned: number
  new_balance: number
  punch_cards_hit: string[]
  transaction_id: string
}

export type RewardExpirationPolicy =
  | { type: 'never' }
  | { type: 'rolling'; days: number }
  | { type: 'fixed'; date: string }
  | { type: 'inactivity'; days: number }

export interface RewardBranding {
  program_name?: string
  logo_url?: string | null
  background_color?: string
  foreground_color?: string
  label_color?: string
  card_description?: string
  support_url?: string
  terms?: string
  barcode_enabled?: boolean
}

export interface RewardMembership {
  id: string
  tenant_id: string
  customer_id: string
  program_id: string
  status: 'active' | 'paused' | 'closed'
  membership_number: string
  wallet_enabled: boolean
  joined_at: string
  updated_at: string
}

export interface RewardTier {
  id: string
  tenant_id: string
  program_id: string
  name: string
  rank: number
  qualification_type: 'points' | 'spend' | 'visits' | 'purchases' | 'appointments'
  threshold: number
  qualification_window: 'lifetime' | 'rolling_12_months'
  points_multiplier: number
  benefits: Record<string, unknown>
  color: string | null
  enabled: boolean
}

export interface RewardPromotion {
  id: string
  tenant_id: string
  program_id: string
  name: string
  status: 'draft' | 'active' | 'paused' | 'ended' | 'archived'
  rule_type: 'multiplier' | 'bonus_points' | 'bonus_punch' | 'spend_bonus' | 'visit_bonus'
  multiplier: number | null
  bonus_points: number | null
  bonus_punches: number | null
  minimum_spend: number | null
  starts_at: string
  ends_at: string
}

export interface WalletPassDomainModel {
  membershipName: string
  customerDisplayName: string
  membershipNumber: string
  pointsBalance: number
  pointsLabel: string
  tier: string | null
  tierProgress: { current: number; target: number; label: string } | null
  punchProgress: { current: number; target: number; label: string } | null
  nextReward: string | null
  barcodeToken: string
  brandColors: {
    background: string
    foreground: string
    label: string
  }
  logoUrl: string | null
  terms: string | null
  supportUrl: string | null
}
