import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export default async function RewardsAnalyticsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? ''
  if (tenantId) await guardModuleAccess(tenantId, 'rewards', ctx.role)
  const db = getSupabaseServerClient() as any
  const [members, transactions, redemptions, punches, referrals, tiers, revenue] =
    await Promise.all([
      db
        .from('reward_memberships')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('status', 'active'),
      db
        .from('rewards_transactions')
        .select('points_delta,transaction_type')
        .eq('tenant_id', tenantId),
      db
        .from('reward_redemptions')
        .select('id,status,reward_shop_items(name)')
        .eq('tenant_id', tenantId),
      db
        .from('reward_punch_card_events')
        .select('punches_added,event_type')
        .eq('tenant_id', tenantId),
      db.from('reward_referrals').select('status').eq('tenant_id', tenantId),
      db.from('reward_customer_tiers').select('reward_tiers(name)').eq('tenant_id', tenantId),
      db
        .from('reward_analytics_events')
        .select('revenue_amount')
        .eq('tenant_id', tenantId)
        .not('revenue_amount', 'is', null),
    ])
  const tx = transactions.data ?? []
  const issued = tx
    .filter((row: any) => row.points_delta > 0)
    .reduce((sum: number, row: any) => sum + Number(row.points_delta), 0)
  const redeemed = Math.abs(
    tx
      .filter((row: any) => row.transaction_type === 'redeemed')
      .reduce((sum: number, row: any) => sum + Number(row.points_delta), 0)
  )
  const outstanding =
    issued -
    Math.abs(
      tx
        .filter((row: any) => row.points_delta < 0)
        .reduce((sum: number, row: any) => sum + Number(row.points_delta), 0)
    )
  const redemptionCount = (redemptions.data ?? []).filter(
    (row: any) => row.status === 'redeemed'
  ).length
  const referralQualified = (referrals.data ?? []).filter((row: any) =>
    ['qualified', 'rewarded'].includes(row.status)
  ).length
  const metrics = [
    ['Members', members.count ?? 0],
    ['Points issued', issued],
    ['Points redeemed', redeemed],
    ['Outstanding points', outstanding],
    [
      'Punches issued',
      (punches.data ?? [])
        .filter((row: any) => row.punches_added > 0)
        .reduce((sum: number, row: any) => sum + Number(row.punches_added), 0),
    ],
    ['Rewards redeemed', redemptionCount],
    [
      'Redemption rate',
      (redemptions.data ?? []).length
        ? `${Math.round((redemptionCount / (redemptions.data ?? []).length) * 100)}%`
        : '0%',
    ],
    ['Referral conversions', referralQualified],
    [
      'Reward revenue',
      (revenue.data ?? [])
        .reduce((sum: number, row: any) => sum + Number(row.revenue_amount ?? 0), 0)
        .toLocaleString('en-US', { style: 'currency', currency: 'USD' }),
    ],
    ['Estimated liability', `$${(outstanding * 0.01).toFixed(2)}`],
  ]
  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Rewards analytics</h1>
        <p className="mt-1 text-sm text-white/40">
          Real ledger, redemption, punch, tier, referral, and attributed revenue data.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
          >
            <p className="text-2xl font-semibold text-white tabular-nums">
              {typeof value === 'number' ? value.toLocaleString() : String(value)}
            </p>
            <p className="mt-1 text-xs text-white/40">{String(label)}</p>
            {label === 'Estimated liability' && (
              <p className="mt-2 text-[11px] text-white/30">
                Estimate at $0.01 per outstanding point.
              </p>
            )}
          </div>
        ))}
      </div>
      <section>
        <h2 className="text-base font-semibold text-white">Tier distribution</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(
            (tiers.data ?? []).reduce((acc: Record<string, number>, row: any) => {
              const name = row.reward_tiers?.name ?? 'Member'
              acc[name] = (acc[name] ?? 0) + 1
              return acc
            }, {})
          ).map(([name, count]) => (
            <span
              key={name}
              className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-sm text-white/60"
            >
              {name}: {String(count)}
            </span>
          ))}
        </div>
      </section>
    </div>
  )
}
