import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { RewardsEntityManager } from '@/components/rewards/RewardsEntityManager'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Punch Cards | Rewards' }

export default async function PunchCardsAdminPage() {
  const ctx = await requireRole(['owner', 'admin'])
  const tenantId = ctx.tenant_id ?? ''
  if (tenantId) await guardModuleAccess(tenantId, 'rewards', ctx.role)
  const db = getSupabaseServerClient() as any
  const [{ data: definitions }, { data: progress }] = await Promise.all([
    db
      .from('reward_punch_definitions')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false }),
    db
      .from('reward_punch_cards')
      .select('id,title,current_punches,punch_goal,status,cycle,customers(name)')
      .eq('tenant_id', tenantId)
      .order('updated_at', { ascending: false })
      .limit(100),
  ])
  return (
    <div className="space-y-8">
      <RewardsEntityManager
        resource="punch-definitions"
        title="Punch Cards"
        description="Create reusable purchase, visit, and appointment punch cards. Every change is preserved in the punch event ledger."
        records={definitions ?? []}
        fields={[
          { key: 'name', label: 'Card name', required: true },
          { key: 'description', label: 'Description', type: 'textarea' },
          {
            key: 'required_punches',
            label: 'Required punches',
            type: 'number',
            required: true,
            defaultValue: 10,
          },
          {
            key: 'reward_type',
            label: 'Reward',
            type: 'select',
            defaultValue: 'free_item',
            options: ['free_item', 'percent_off', 'fixed_off', 'bonus_points', 'custom'].map(
              (value) => ({ label: value.replaceAll('_', ' '), value })
            ),
          },
          { key: 'reward_value', label: 'Reward value', type: 'number' },
          {
            key: 'earning_method',
            label: 'Earning method',
            type: 'select',
            defaultValue: 'purchase',
            options: ['purchase', 'appointment', 'visit', 'manual'].map((value) => ({
              label: value,
              value,
            })),
          },
          { key: 'repeatable', label: 'Repeatable', type: 'checkbox', defaultValue: true },
          {
            key: 'maximum_active_cards',
            label: 'Maximum active cards',
            type: 'number',
            defaultValue: 1,
          },
          { key: 'expires_after_days', label: 'Expires after days', type: 'number' },
          { key: 'enabled', label: 'Enabled', type: 'checkbox', defaultValue: true },
        ]}
      />
      <section>
        <h2 className="text-base font-semibold text-white">Customer progress</h2>
        <p className="mt-1 text-sm text-white/40">
          Live progress backed by auditable punch events.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {(progress ?? []).length ? (
            (progress ?? []).map((card: any) => (
              <article
                key={card.id}
                className="rounded-2xl border border-white/10 bg-white/[0.035] p-5"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-medium text-white">{card.title}</h3>
                    <p className="mt-1 text-xs text-white/40">
                      {card.customers?.name ?? 'Customer'} | Cycle {card.cycle}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-gold-300">
                    {card.current_punches} / {card.punch_goal}
                  </span>
                </div>
              </article>
            ))
          ) : (
            <p className="rounded-2xl border border-dashed border-white/15 p-6 text-sm text-white/40 md:col-span-2">
              No customers have earned punches yet.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}
