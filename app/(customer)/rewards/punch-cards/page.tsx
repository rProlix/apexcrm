export const dynamic = 'force-dynamic'

// app/(customer)/rewards/punch-cards/page.tsx
import { headers } from 'next/headers'
import { requireCustomerAuth } from '@/lib/auth/customerGuard'
import { getCustomerPunchCards } from '@/lib/rewards/getPunchCardProgress'
import { PunchCardProgress } from '@/components/rewards/PunchCardProgress'
import { Zap, ShoppingBag } from 'lucide-react'
import Link from 'next/link'

export const metadata = { title: 'Punch Cards — Rewards' }

export default async function CustomerPunchCardsPage() {
  const host = (await headers()).get('host') ?? ''
  const ctx  = await requireCustomerAuth(host)

  const allCards   = await getCustomerPunchCards(ctx.tenant_id, ctx.customer_id)
  const active     = allCards.filter((c) => c.status === 'active')
  const completed  = allCards.filter((c) => c.status === 'completed')

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center">
          <Zap className="h-6 w-6 text-gold-400" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Punch Cards</h1>
          <p className="text-sm text-white/40">Track your progress towards free rewards</p>
        </div>
      </div>

      {allCards.length === 0 ? (
        <div className="premium-panel premium-border rounded-2xl p-12 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gold-400/10 border border-gold-400/20 flex items-center justify-center mx-auto mb-4">
            <Zap className="h-7 w-7 text-gold-400/50" strokeWidth={1.5} />
          </div>
          <h3 className="text-sm font-semibold text-white mb-2">No punch cards yet</h3>
          <p className="text-xs text-white/40 mb-5">
            Make purchases to start working towards punch card rewards.
          </p>
          <Link
            href="/store"
            className="inline-flex items-center gap-2 bg-gold-gradient text-graphite-900 font-semibold text-sm px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
          >
            <ShoppingBag className="h-4 w-4" />
            Shop Now
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-white mb-4">
                In Progress ({active.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {active.map((card) => (
                  <PunchCardProgress key={card.id} card={card} />
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-white mb-4">
                Completed ({completed.length})
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {completed.map((card) => (
                  <PunchCardProgress key={card.id} card={card} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
