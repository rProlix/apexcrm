// app/(dashboard)/dashboard/rewards/punch-cards/page.tsx
import { requireRole } from '@/lib/auth/requireRole'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getAllProductRewardsConfigs } from '@/lib/rewards/getProductRewardsConfig'
import { getAllPunchCards } from '@/lib/rewards/getPunchCardProgress'
import { getRewardsProgram } from '@/lib/rewards/getRewardsProgram'
import { PunchCardForm } from '@/components/rewards/PunchCardForm'
import { PunchCardProgress } from '@/components/rewards/PunchCardProgress'
import { ConfiguredRulesPanel } from '@/components/rewards/ConfiguredRulesPanel'
import { Zap, Users } from 'lucide-react'

export const metadata = { title: 'Punch Cards — Rewards' }

export default async function PunchCardsAdminPage() {
  const ctx = await requireRole(['owner', 'admin'])
  if (ctx.tenant_id) await guardModuleAccess(ctx.tenant_id, 'rewards', ctx.role)

  const tenantId = ctx.tenant_id ?? ''

  const [program, products, customerCards] = await Promise.all([
    getRewardsProgram(tenantId),
    getAllProductRewardsConfigs(tenantId),
    getAllPunchCards(tenantId),
  ])

  const configuredRules  = program?.punch_card_rules ?? []
  const activeRules      = configuredRules.filter((r) => r.enabled)
  const activeCustomers  = customerCards.filter((c) => c.status === 'active')
  const completedCustomers = customerCards.filter((c) => c.status === 'completed')

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Punch Cards</h1>
        <p className="text-sm text-white/40 mt-1">
          Configure buy-X-get-Y style rewards. Progress is tracked automatically when customers place orders.
        </p>
      </div>

      {/* ── Step 1: Configure rules ─────────────────────────────────────── */}
      <PunchCardForm
        tenantId={tenantId}
        program={program}
        products={products}
      />

      {/* ── Step 2: Configured rules summary (read-only confirmation) ────── */}
      {configuredRules.length > 0 && (
        <ConfiguredRulesPanel
          rules={configuredRules}
          products={products}
        />
      )}

      {/* No rules configured yet */}
      {configuredRules.length === 0 && (
        <div className="premium-panel premium-border rounded-2xl p-8 text-center border-dashed border-white/10">
          <Zap className="h-8 w-8 text-white/20 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-white/50 mb-1">No punch cards configured yet</p>
          <p className="text-xs text-white/30">
            Use the form above to add punch card rules, then click Save.
            Once saved they will appear here and begin tracking customer progress.
          </p>
        </div>
      )}

      {/* ── Customer progress ─────────────────────────────────────────────── */}
      {configuredRules.length > 0 && (
        <div className="space-y-5">
          {/* In-progress */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-4 w-4 text-amber-400" strokeWidth={1.75} />
              <h2 className="text-base font-semibold text-white">
                Customer Progress
              </h2>
              <span className="text-xs text-white/30 ml-1">({activeCustomers.length} active)</span>
            </div>

            {activeCustomers.length === 0 ? (
              <div className="premium-panel premium-border rounded-2xl p-6 text-center">
                <p className="text-sm text-white/40">No customers have earned punches yet.</p>
                <p className="text-xs text-white/25 mt-1">
                  Progress is automatically tracked when customers purchase qualifying products.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeCustomers.map((card) => (
                  <PunchCardProgress key={card.id} card={card} isAdmin />
                ))}
              </div>
            )}
          </div>

          {/* Completed */}
          {completedCustomers.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-white/50 mb-3">
                Completed ({completedCustomers.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completedCustomers.map((card) => (
                  <PunchCardProgress key={card.id} card={card} isAdmin />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
