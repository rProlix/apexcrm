// modules/rewards/index.ts
import { Star } from 'lucide-react'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export const rewardsModule: ModuleDefinition = {
  key:         'rewards',
  label:       'Rewards',
  description: 'Manage customer loyalty points, punch cards, and rewards shop',
  icon:        Star,
  href:        '/dashboard/rewards',
  color:       'text-yellow-400',
  bgColor:     'bg-yellow-400/10',
  order:       3,

  stats: [
    {
      key:          'rewards_members',
      label:        'Loyalty Members',
      category:     'usage',
      color:        'text-yellow-400',
      emptyMessage: 'No loyalty members yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('rewards_balances')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
        // Fall back to legacy reward_points table if new table is empty
        if (!count) {
          const { count: legacy } = await supabase
            .from('reward_points')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
          return legacy ?? 0
        }
        return count ?? 0
      },
    },
    {
      key:          'rewards_points_total',
      label:        'Points Issued',
      category:     'usage',
      color:        'text-amber-400',
      emptyMessage: 'No points issued',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { data } = await supabase
          .from('rewards_balances')
          .select('lifetime_points_earned')
          .eq('tenant_id', tenantId)
        if (data && data.length > 0) {
          return data.reduce((sum, r) => sum + (r.lifetime_points_earned ?? 0), 0)
        }
        // Fall back to legacy
        const { data: legacy } = await supabase
          .from('reward_points')
          .select('balance')
          .eq('tenant_id', tenantId)
        return (legacy ?? []).reduce((sum, r) => sum + r.balance, 0)
      },
    },
    {
      key:          'rewards_shop_items',
      label:        'Shop Items',
      category:     'usage',
      color:        'text-orange-400',
      emptyMessage: 'No shop items yet',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('reward_shop_items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
        return count ?? 0
      },
    },
    {
      key:          'rewards_active_punch_cards',
      label:        'Active Punch Cards',
      category:     'operations',
      color:        'text-gold-400',
      emptyMessage: 'No active punch cards',
      async getValue(tenantId) {
        const supabase = getSupabaseServerClient()
        const { count } = await supabase
          .from('reward_punch_cards')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('status', 'active')
        return count ?? 0
      },
    },
  ],

  async getStats(tenantId) {
    const supabase = getSupabaseServerClient()

    const [balancesRes, shopRes, punchRes] = await Promise.all([
      supabase
        .from('rewards_balances')
        .select('lifetime_points_earned, lifetime_points_redeemed, points_balance')
        .eq('tenant_id', tenantId),
      supabase
        .from('reward_shop_items')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('is_active', true),
      supabase
        .from('reward_punch_cards')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
    ])

    const balances = balancesRes.data ?? []
    const totalIssued    = balances.reduce((s, r) => s + (r.lifetime_points_earned ?? 0), 0)
    const totalRedeemed  = balances.reduce((s, r) => s + (r.lifetime_points_redeemed ?? 0), 0)

    return [
      { label: 'Members',       value: balances.length },
      { label: 'Points Issued', value: totalIssued.toLocaleString() },
      { label: 'Redeemed',      value: totalRedeemed.toLocaleString() },
      { label: 'Shop Items',    value: shopRes.count ?? 0 },
      { label: 'Punch Cards',   value: punchRes.count ?? 0 },
    ]
  },
}
