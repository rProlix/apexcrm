import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RewardsEntityManager } from '@/components/rewards/RewardsEntityManager'

export default async function RewardTiersPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? ''
  if (tenantId) await guardModuleAccess(tenantId, 'rewards', ctx.role)
  const { data } = await (getSupabaseServerClient() as any)
    .from('reward_tiers')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('rank')
  return (
    <RewardsEntityManager
      resource="tiers"
      title="Tiers"
      description="Qualify customers by real activity and apply tier-specific point multipliers."
      records={data ?? []}
      fields={[
        { key: 'name', label: 'Tier name', required: true },
        { key: 'rank', label: 'Rank', type: 'number', required: true, defaultValue: 0 },
        {
          key: 'qualification_type',
          label: 'Qualification',
          type: 'select',
          defaultValue: 'points',
          options: ['points', 'spend', 'visits', 'purchases', 'appointments'].map((value) => ({
            label: value,
            value,
          })),
        },
        { key: 'threshold', label: 'Threshold', type: 'number', required: true, defaultValue: 0 },
        {
          key: 'qualification_window',
          label: 'Window',
          type: 'select',
          defaultValue: 'lifetime',
          options: [
            { label: 'Lifetime', value: 'lifetime' },
            { label: 'Rolling 12 months', value: 'rolling_12_months' },
          ],
        },
        { key: 'points_multiplier', label: 'Points multiplier', type: 'number', defaultValue: 1 },
        { key: 'color', label: 'Tier color', defaultValue: '#d6b253' },
        { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
      ]}
    />
  )
}
