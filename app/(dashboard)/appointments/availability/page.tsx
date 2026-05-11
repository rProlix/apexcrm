'use client'

export const dynamic = 'force-dynamic'

// app/(dashboard)/appointments/availability/page.tsx
// Dedicated availability block management page.
// Accessible at /appointments/availability from the dashboard.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Clock, Info, ExternalLink } from 'lucide-react'
import { AvailabilityBlocksManager } from '@/components/appointments/AvailabilityBlocksManager'
import Link from 'next/link'

export default function AppointmentsAvailabilityPage() {
  const [showDiag, setShowDiag] = useState(false)

  return (
    <div className="space-y-6">
      {/* Page header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gold-400/10 flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Appointment Availability</h1>
            <p className="text-xs text-white/40 mt-0.5">
              Create available hours, blackout dates, and staff-specific booking windows
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowDiag((v) => !v)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-graphite-700 border border-surface-border text-xs text-white/40 hover:text-white transition-colors"
            title="System diagnostics"
          >
            <Info className="w-3 h-3" />
            Diagnostics
          </button>
        </div>
      </motion.div>

      {/* Diagnostics panel */}
      {showDiag && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="rounded-xl border border-gold-500/20 bg-gold-400/5 overflow-hidden"
        >
          <DiagnosticsPanel onClose={() => setShowDiag(false)} />
        </motion.div>
      )}

      {/* How availability blocks work — info banner */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex items-start gap-3 rounded-xl border border-gold-500/20 bg-gold-400/5 px-4 py-3"
      >
        <Info className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
        <div className="text-xs text-white/50 space-y-1 flex-1">
          <p>
            <span className="text-emerald-400 font-medium">Available blocks</span> define when customers can book.
            {' '}<span className="text-red-400 font-medium">Blackout blocks</span> prevent booking during that window even if an available block exists.
          </p>
          <p>
            Assign blocks to a specific <span className="text-white/70 font-medium">Professional</span> or leave unassigned to apply to all staff.
            Use quick-create presets or the <span className="text-white/70 font-medium">Add Block</span> button to get started.
          </p>
          <p className="pt-0.5">
            <Link href="/appointments/settings" className="text-gold-400/70 hover:text-gold-400 underline underline-offset-2 inline-flex items-center gap-1">
              Advanced settings <ExternalLink className="w-3 h-3" />
            </Link>
            {' '}— manage professionals, legacy schedule rules, and blocked times.
          </p>
        </div>
      </motion.div>

      {/* The actual availability blocks manager */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <AvailabilityBlocksManager />
      </motion.div>
    </div>
  )
}

// ── Diagnostics panel (owner only helper) ─────────────────────────────────────

function DiagnosticsPanel({ onClose }: { onClose: () => void }) {
  const [data,    setData]    = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function run() {
    setLoading(true)
    setError(null)
    try {
      const res  = await fetch('/api/owner/diagnostics/appointments')
      const json = await res.json()
      setData(json)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Diagnostics failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gold-400">System Diagnostics</p>
        <button onClick={onClose} className="text-white/30 hover:text-white text-xs">✕</button>
      </div>

      {!data && !loading && (
        <button
          onClick={run}
          className="h-8 px-4 rounded-lg bg-gold-gradient text-graphite-900 text-xs font-semibold hover:shadow-glow-gold transition-shadow"
        >
          Run checks
        </button>
      )}

      {loading && <p className="text-xs text-white/40 animate-pulse">Running diagnostics…</p>}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {data && (
        <div className="space-y-2">
          {Array.isArray((data as { checks?: unknown[] }).checks) && (data as { checks: Array<{ label: string; ok: boolean; detail?: string }> }).checks.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={c.ok ? 'text-emerald-400' : 'text-red-400'}>{c.ok ? '✓' : '✗'}</span>
              <div>
                <span className={c.ok ? 'text-white/70' : 'text-red-300'}>{c.label}</span>
                {c.detail && <p className="text-white/30 mt-0.5">{c.detail}</p>}
              </div>
            </div>
          ))}
          <button
            onClick={run}
            className="text-xs text-white/30 hover:text-white/60 underline"
          >
            Re-run
          </button>
        </div>
      )}
    </div>
  )
}
