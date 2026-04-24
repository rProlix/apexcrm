// types/rewards.ts
// Shared TypeScript types for the Rewards / Loyalty module.

// ─── Earning Rules ────────────────────────────────────────────────────────────

export interface BonusPointsProduct {
  product_id:   string
  bonus_points: number
  product_name?: string
}

export interface EarningRules {
  points_per_dollar?:    number
  enabled?:              boolean
  bonus_points_products?: BonusPointsProduct[]
}

// ─── Punch Card Rules ─────────────────────────────────────────────────────────

export type PunchCardRewardType = 'free_item' | 'percent_off' | 'fixed_off' | 'bonus_points'

export interface PunchCardRule {
  id:           string
  name:         string
  product_id:   string | null
  product_name?: string
  punch_goal:   number
  reward_type:  PunchCardRewardType
  reward_value: number | null
  enabled:      boolean
}

// ─── Program Settings ─────────────────────────────────────────────────────────

export interface ProgramSettings {
  points_enabled:        boolean
  punch_cards_enabled:   boolean
  shop_enabled:          boolean
  min_redemption_points: number
}

// ─── Rewards Program ──────────────────────────────────────────────────────────

export type RewardsProgramStatus = 'active' | 'paused' | 'archived'

export interface RewardsProgram {
  id:               string
  tenant_id:        string
  name:             string
  description:      string | null
  status:           RewardsProgramStatus
  earning_rules:    EarningRules
  punch_card_rules: PunchCardRule[]
  settings:         ProgramSettings
  created_at:       string
  updated_at:       string
}

// ─── Rewards Balance ──────────────────────────────────────────────────────────

export interface RewardsBalance {
  id:                       string
  tenant_id:                string
  customer_id:              string
  points_balance:           number
  lifetime_points_earned:   number
  lifetime_points_redeemed: number
  updated_at:               string
  created_at:               string
}

// ─── Rewards Transaction ──────────────────────────────────────────────────────

export type TransactionType = 'earned' | 'redeemed' | 'adjusted' | 'expired' | 'bonus'
export type SourceType      = 'order' | 'product' | 'manual' | 'punch_card' | 'reward_item' | 'admin_adjustment'

export interface RewardsTransaction {
  id:               string
  tenant_id:        string
  customer_id:      string
  program_id:       string | null
  transaction_type: TransactionType
  points_delta:     number
  source_type:      SourceType | null
  source_id:        string | null
  metadata:         Record<string, unknown>
  created_at:       string
}

// ─── Reward Shop Item ─────────────────────────────────────────────────────────

export type RedemptionType = 'discount' | 'free_item' | 'points_only' | 'custom'
export type DiscountType   = 'percent' | 'fixed_amount'

export interface RewardShopItem {
  id:                           string
  tenant_id:                    string
  name:                         string
  description:                  string | null
  points_cost:                  number
  is_active:                    boolean
  image_url:                    string | null
  product_id:                   string | null
  redemption_type:              RedemptionType
  discount_type:                DiscountType | null
  discount_value:               number | null
  inventory_count:              number
  max_redemptions_per_customer: number | null
  settings:                     Record<string, unknown>
  created_at:                   string
  updated_at:                   string
  // Joined product data (optional)
  product?:                     { name: string; price: number } | null
}

// ─── Reward Redemption ────────────────────────────────────────────────────────

export type RedemptionStatus = 'pending' | 'approved' | 'fulfilled' | 'canceled'

export interface RewardRedemption {
  id:             string
  tenant_id:      string
  customer_id:    string
  reward_item_id: string | null
  points_used:    number
  status:         RedemptionStatus
  metadata:       Record<string, unknown>
  created_at:     string
  updated_at:     string
  // Joined
  reward_shop_items?: { name: string; redemption_type: string } | null
}

// ─── Punch Card ───────────────────────────────────────────────────────────────

export type PunchCardStatus = 'active' | 'completed' | 'expired'

export interface RewardPunchCard {
  id:              string
  tenant_id:       string
  customer_id:     string
  product_id:      string | null
  title:           string
  punch_goal:      number
  current_punches: number
  reward_type:     PunchCardRewardType
  reward_value:    number | null
  status:          PunchCardStatus
  metadata:        Record<string, unknown>
  created_at:      string
  updated_at:      string
  // Joined
  products?: { name: string } | null
}

// ─── Punch Card Event ─────────────────────────────────────────────────────────

export interface RewardPunchCardEvent {
  id:            string
  tenant_id:     string
  punch_card_id: string
  customer_id:   string
  order_id:      string | null
  product_id:    string | null
  punches_added: number
  metadata:      Record<string, unknown>
  created_at:    string
}

// ─── Product with Rewards Config ──────────────────────────────────────────────

export interface ProductWithRewards {
  id:                    string
  tenant_id:             string
  name:                  string
  description:           string | null
  price:                 number
  currency:              string
  inventory_count:       number
  is_active:             boolean
  rewards_points_earned: number | null
  rewards_enabled:       boolean
  rewards_multiplier:    number
  created_at:            string
}

// ─── Order Item (for points calculation) ──────────────────────────────────────

export interface OrderItemForRewards {
  product_id: string
  quantity:   number
  price:      number
}

// ─── Points Calculation Result ────────────────────────────────────────────────

export interface PointsCalculationResult {
  total_points:    number
  breakdown:       PointsBreakdownItem[]
  program_id:      string | null
}

export interface PointsBreakdownItem {
  product_id:   string
  product_name: string
  quantity:     number
  points:       number
  source:       'custom' | 'bonus' | 'default'
}

// ─── Apply Order Rewards Result ───────────────────────────────────────────────

export interface ApplyOrderRewardsResult {
  points_earned:    number
  new_balance:      number
  punch_cards_hit:  string[]
  transaction_id:   string
}
