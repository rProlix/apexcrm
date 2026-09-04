'use client'

import { useState, useTransition } from 'react'
import { Minus, Plus } from 'lucide-react'

export function RewardsCustomersClient({
  customers,
}: {
  customers: Array<{
    customer_id: string
    name: string
    email: string | null
    points: number
    lifetime: number
    tier: string | null
  }>
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [direction, setDirection] = useState<1 | -1>(1)
  const [error, setError] = useState('')
  const [pending, startTransition] = useTransition()
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    const form = new FormData(event.currentTarget)
    const amount = Number(form.get('amount'))
    const reason = String(form.get('reason') ?? '').trim()
    if (!Number.isInteger(amount) || amount <= 0 || !reason) {
      setError('Enter a whole point amount and a reason.')
      return
    }
    startTransition(async () => {
      const response = await fetch('/api/rewards/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selected,
          points_delta: direction * amount,
          reason,
          idempotency_key: `manual:${selected}:${crypto.randomUUID()}`,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        setError(result.error || 'Adjustment failed')
        return
      }
      window.location.reload()
    })
  }
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Reward customers</h1>
        <p className="mt-1 text-sm text-white/40">
          Balances, tier status, and audited manual adjustments.
        </p>
      </header>
      <div className="overflow-hidden rounded-2xl border border-white/10">
        <div className="hidden grid-cols-[1.5fr_0.8fr_0.8fr_auto] gap-4 border-b border-white/10 bg-white/[0.035] px-5 py-3 text-xs font-medium text-white/40 sm:grid">
          <span>Customer</span>
          <span>Points</span>
          <span>Tier</span>
          <span>Adjust</span>
        </div>
        {customers.length ? (
          customers.map((customer) => (
            <div
              key={customer.customer_id}
              className="grid gap-3 border-b border-white/8 px-5 py-4 last:border-0 sm:grid-cols-[1.5fr_0.8fr_0.8fr_auto] sm:items-center"
            >
              <div>
                <p className="text-sm text-white">{customer.name}</p>
                <p className="text-xs text-white/35">{customer.email ?? 'No email'}</p>
              </div>
              <p className="text-sm font-semibold text-gold-300 tabular-nums">
                {customer.points.toLocaleString()}
              </p>
              <p className="text-sm text-white/55">{customer.tier ?? 'Member'}</p>
              <div className="flex gap-2">
                <button
                  aria-label={`Add points for ${customer.name}`}
                  onClick={() => {
                    setSelected(customer.customer_id)
                    setDirection(1)
                  }}
                  className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 p-2 text-emerald-300"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  aria-label={`Remove points for ${customer.name}`}
                  onClick={() => {
                    setSelected(customer.customer_id)
                    setDirection(-1)
                  }}
                  className="rounded-lg border border-orange-400/20 bg-orange-400/10 p-2 text-orange-300"
                >
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="p-8 text-center text-sm text-white/40">No reward members yet.</p>
        )}
      </div>
      {selected && (
        <form
          onSubmit={submit}
          className="rounded-2xl border border-gold-400/20 bg-white/[0.035] p-5"
        >
          <h2 className="font-medium text-white">
            {direction > 0 ? 'Add points' : 'Remove points'}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className="text-xs text-white/50">Points</span>
              <input
                name="amount"
                type="number"
                min="1"
                step="1"
                required
                className="store-input rounded-xl px-3 py-2.5"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-xs text-white/50">Reason</span>
              <input name="reason" required className="store-input rounded-xl px-3 py-2.5" />
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button
              disabled={pending}
              className="rounded-xl bg-gold-400 px-4 py-2 text-sm font-semibold text-graphite-950"
            >
              {pending ? 'Saving...' : 'Confirm adjustment'}
            </button>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="px-4 py-2 text-sm text-white/50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
