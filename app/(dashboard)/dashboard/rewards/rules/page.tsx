import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RewardsEntityManager } from '@/components/rewards/RewardsEntityManager'

export default async function RewardRulesPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? ''
  if (tenantId) await guardModuleAccess(tenantId, 'rewards', ctx.role)
  const { data } = await (getSupabaseServerClient() as any)
    .from('reward_rules')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
  return (
    <RewardsEntityManager
      resource="rules"
      title="Earning Rules"
      description="Award points from completed orders, appointments, birthdays, referrals, and manual activity."
      records={data ?? []}
      fields={[
        { key: 'name', label: 'Rule name', required: true },
        {
          key: 'event_type',
          label: 'Event',
          type: 'select',
          defaultValue: 'order_completed',
          options: [
            'order_completed',
            'payment_confirmed',
            'appointment_completed',
            'first_appointment',
            'birthday',
            'referral_qualified',
            'manual',
          ].map((value) => ({ label: value.replaceAll('_', ' '), value })),
        },
        {
          key: 'earning_basis',
          label: 'Basis',
          type: 'select',
          defaultValue: 'spend',
          options: ['fixed', 'spend', 'product', 'category', 'service', 'visit'].map((value) => ({
            label: value,
            value,
          })),
        },
        { key: 'amount_threshold', label: 'Amount threshold', type: 'number', defaultValue: 1 },
        { key: 'points_awarded', label: 'Points awarded', type: 'number', defaultValue: 1 },
        { key: 'points_per_currency', label: 'Points per currency unit', type: 'number' },
        { key: 'minimum_spend', label: 'Minimum spend', type: 'number' },
        { key: 'maximum_per_event', label: 'Maximum per event', type: 'number' },
        { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
      ]}
    />
  )
}
