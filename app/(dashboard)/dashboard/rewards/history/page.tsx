// app/(dashboard)/rewards/history/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RewardsHistoryList } from '@/components/rewards/RewardsHistoryList'
import { RewardsBalanceList } from '@/components/rewards/RewardsBalanceList'

export const metadata = { title: 'Rewards History' }

export default async function RewardsHistoryPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'rewards', ctx.role)

  const tenantId = ctx.tenant_id ?? ''
  const supabase = getSupabaseServerClient()

  const [txnRes, balancesRes, redemptionsRes] = await Promise.all([
    supabase
      .from('rewards_transactions')
      .select('*, customers(name, email)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('rewards_balances')
      .select('*, customers(name, email)')
      .eq('tenant_id', tenantId)
      .order('points_balance', { ascending: false }),
    supabase
      .from('reward_redemptions')
      .select('*, reward_shop_items(name), customers(name, email)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Rewards History</h1>
        <p className="text-sm text-white/40 mt-1">View all customer points activity and redemptions.</p>
      </div>

      <RewardsBalanceList balances={(balancesRes.data ?? []) as any} />

      <RewardsHistoryList
        transactions={(txnRes.data ?? []) as any}
        redemptions={(redemptionsRes.data ?? []) as any}
      />
    </div>
  )
}
