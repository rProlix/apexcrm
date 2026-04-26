export const dynamic = 'force-dynamic'

// app/(dashboard)/rewards/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RewardsDashboard } from '@/components/rewards/RewardsDashboard'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'

export const metadata = { title: 'Rewards — Dashboard' }

export default async function RewardsDashboardPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'rewards', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  const supabase = getSupabaseServerClient()

  const [program, balancesRes, shopRes, punchRes, txnRes] = await Promise.all([
    getRewardsProgram(tenantId),
    supabase
      .from('rewards_balances')
      .select('points_balance, lifetime_points_earned, lifetime_points_redeemed')
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
    supabase
      .from('rewards_transactions')
      .select('points_delta, transaction_type, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const balances  = (balancesRes.data ?? []) as Array<{
    points_balance: number; lifetime_points_earned: number; lifetime_points_redeemed: number
  }>
  const totalIssued   = balances.reduce((s, r) => s + (r.lifetime_points_earned ?? 0), 0)
  const totalRedeemed = balances.reduce((s, r) => s + (r.lifetime_points_redeemed ?? 0), 0)

  return (
    <RewardsDashboard
      tenantId={tenantId}
      program={program}
      stats={{
        members:        balances.length,
        totalIssued,
        totalRedeemed,
        shopItems:      shopRes.count ?? 0,
        activePunchCards: punchRes.count ?? 0,
      }}
      recentTransactions={(txnRes.data ?? []) as any}
    />
  )
}
