import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RewardsEntityManager } from '@/components/rewards/RewardsEntityManager'

export default async function RewardReferralsPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? ''
  if (tenantId) await guardModuleAccess(tenantId, 'rewards', ctx.role)
  const db = getSupabaseServerClient() as any
  const [{ data: programs }, { data: referrals }] = await Promise.all([
    db.from('reward_referral_programs').select('*').eq('tenant_id', tenantId),
    db
      .from('reward_referrals')
      .select('*,customers!reward_referrals_referrer_customer_id_fkey(name)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  return (
    <div className="space-y-8">
      <RewardsEntityManager
        resource="referral-programs"
        title="Referral Programs"
        description="Reward both sides after a verified signup, purchase, or appointment."
        records={programs ?? []}
        fields={[
          { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
          {
            key: 'qualification_type',
            label: 'Qualification',
            type: 'select',
            defaultValue: 'first_purchase',
            options: ['signup', 'first_purchase', 'first_appointment'].map((value) => ({
              label: value.replaceAll('_', ' '),
              value,
            })),
          },
          { key: 'referrer_points', label: 'Referrer points', type: 'number', defaultValue: 500 },
          {
            key: 'referred_points',
            label: 'New customer points',
            type: 'number',
            defaultValue: 250,
          },
          { key: 'terms', label: 'Terms', type: 'textarea' },
        ]}
      />
      <section>
        <h2 className="text-base font-semibold text-white">Referral activity</h2>
        <div className="mt-3 overflow-hidden rounded-2xl border border-white/10">
          {(referrals ?? []).length ? (
            (referrals ?? []).map((referral: any) => (
              <div
                key={referral.id}
                className="flex items-center justify-between border-b border-white/8 px-5 py-4 last:border-0"
              >
                <span className="text-sm text-white">{referral.customers?.name ?? 'Customer'}</span>
                <span className="text-xs capitalize text-white/45">{referral.status}</span>
              </div>
            ))
          ) : (
            <p className="p-6 text-sm text-white/40">No referral activity yet.</p>
          )}
        </div>
      </section>
    </div>
  )
}
