// lib/rewards/getRewardsProgram.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { RewardsProgram, EarningRules, PunchCardRule, ProgramSettings } from '@/types/rewards'

const DEFAULT_EARNING_RULES: EarningRules = {
  points_per_dollar:    10,
  enabled:              true,
  bonus_points_products: [],
}

const DEFAULT_SETTINGS: ProgramSettings = {
  points_enabled:        true,
  punch_cards_enabled:   true,
  shop_enabled:          true,
  min_redemption_points: 100,
}

/**
 * Returns the active rewards program for a tenant.
 * If none exists, returns a synthetic default so callers never get null.
 */
export async function getRewardsProgram(tenantId: string): Promise<RewardsProgram | null> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('rewards_programs')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[getRewardsProgram]', error.message)
    return null
  }

  if (!data) return null

  return {
    ...data,
    earning_rules:    (data.earning_rules    as unknown as EarningRules)    ?? DEFAULT_EARNING_RULES,
    punch_card_rules: (data.punch_card_rules as unknown as PunchCardRule[]) ?? [],
    settings:         (data.settings         as unknown as ProgramSettings) ?? DEFAULT_SETTINGS,
  } as RewardsProgram
}

/**
 * Returns effective earning rules for a tenant.
 * Falls back to defaults when no program exists.
 */
export async function getEarningRules(tenantId: string): Promise<EarningRules> {
  const program = await getRewardsProgram(tenantId)
  return program?.earning_rules ?? DEFAULT_EARNING_RULES
}

/**
 * Returns effective program settings for a tenant.
 * Falls back to defaults when no program exists.
 */
export async function getProgramSettings(tenantId: string): Promise<ProgramSettings> {
  const program = await getRewardsProgram(tenantId)
  return program?.settings ?? DEFAULT_SETTINGS
}
