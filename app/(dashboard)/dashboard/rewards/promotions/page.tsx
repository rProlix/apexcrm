import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RewardsEntityManager } from '@/components/rewards/RewardsEntityManager'

export default async function RewardPromotionsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? ''
  if (tenantId) await guardModuleAccess(tenantId, 'rewards', ctx.role)
  const { data } = await (getSupabaseServerClient() as any)
    .from('reward_promotions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('starts_at', { ascending: false })
  return (
    <RewardsEntityManager
      resource="promotions"
      title="Promotions"
      description="Run time-limited multipliers, bonus points, and punch campaigns with explicit limits."
      records={data ?? []}
      fields={[
        { key: 'name', label: 'Promotion name', required: true },
        {
          key: 'status',
          label: 'Status',
          type: 'select',
          defaultValue: 'active',
          options: ['draft', 'active', 'paused', 'ended', 'archived'].map((value) => ({
            label: value,
            value,
          })),
        },
        {
          key: 'rule_type',
          label: 'Rule',
          type: 'select',
          defaultValue: 'multiplier',
          options: ['multiplier', 'bonus_points', 'bonus_punch', 'spend_bonus', 'visit_bonus'].map(
            (value) => ({ label: value.replaceAll('_', ' '), value })
          ),
        },
        { key: 'multiplier', label: 'Multiplier', type: 'number', defaultValue: 2 },
        { key: 'bonus_points', label: 'Bonus points', type: 'number' },
        { key: 'bonus_punches', label: 'Bonus punches', type: 'number' },
        { key: 'minimum_spend', label: 'Minimum spend', type: 'number' },
        { key: 'budget_limit', label: 'Issue limit', type: 'number' },
        { key: 'starts_at', label: 'Starts', type: 'datetime-local', required: true },
        { key: 'ends_at', label: 'Ends', type: 'datetime-local', required: true },
      ]}
    />
  )
}
