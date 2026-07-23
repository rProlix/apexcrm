'use client'
// components/website-ai/AiAutofillEmptyState.tsx

import { Wand2 } from 'lucide-react'

const EXAMPLES = [
  '"Maria G: Best salon in Portland. 5 stars. Staff was incredible."',
  '"Open Mon–Fri 9am–6pm, Sat 10am–3pm, closed Sunday."',
  '"Oil change $79, Brake inspection $45, Tire rotation $35."',
  '"Sup Chay $17.50/L — tofu, broccoli, bok choy, noodles in vegan broth."',
  '"Family-owned van rental company serving Portland with clean, reliable vans."',
]

export function AiAutofillEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="h-16 w-16 rounded-2xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center mb-5">
        <Wand2 className="h-8 w-8 text-gold-400/70" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">
        Paste the raw details.
      </h3>
      <p className="text-sm text-white/40 max-w-xs mb-6">
        AI analysis will organize the content — reviews, services, hours, menus, and more.
      </p>
      <div className="text-left w-full max-w-sm space-y-2">
        <p className="text-2xs font-semibold text-white/30 uppercase tracking-widest mb-2">
          Example inputs
        </p>
        {EXAMPLES.map((ex, i) => (
          <div
            key={i}
            className="rounded-lg bg-graphite-800/50 border border-white/6 px-3 py-2 text-xs text-white/40 italic"
          >
            {ex}
          </div>
        ))}
      </div>
    </div>
  )
}
