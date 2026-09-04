import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RewardsCustomersClient } from '@/components/rewards/RewardsCustomersClient'

export default async function RewardCustomersPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? ''
  if (tenantId) await guardModuleAccess(tenantId, 'rewards', ctx.role)
  const db = getSupabaseServerClient() as any
  const [{ data }, { data: tiers }] = await Promise.all([
    db
      .from('rewards_balances')
      .select('customer_id,points_balance,lifetime_points_earned,customers(name,email)')
      .eq('tenant_id', tenantId)
      .order('points_balance', { ascending: false }),
    db
      .from('reward_customer_tiers')
      .select('customer_id,reward_tiers(name)')
      .eq('tenant_id', tenantId),
  ])
  const tierByCustomer = new Map(
    (tiers ?? []).map((row: any) => [row.customer_id, row.reward_tiers?.name ?? null])
  )
  const customers = (data ?? []).map((row: any) => ({
    customer_id: row.customer_id,
    name: row.customers?.name ?? 'Customer',
    email: row.customers?.email ?? null,
    points: Number(row.points_balance),
    lifetime: Number(row.lifetime_points_earned),
    tier: tierByCustomer.get(row.customer_id) ?? null,
  }))
  return <RewardsCustomersClient customers={customers} />
}
