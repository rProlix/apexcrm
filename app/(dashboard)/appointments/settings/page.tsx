'use client'

export const dynamic = 'force-dynamic'

// app/(dashboard)/appointments/settings/page.tsx

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Settings, Clock, Ban, Plus, Trash2,
  CalendarDays, Info, Users, LayoutGrid,
} from 'lucide-react'
import { AvailabilityEditor } from '@/components/appointments/AvailabilityEditor'
import { AvailabilityBlocksManager } from '@/components/appointments/AvailabilityBlocksManager'
import { ProfessionalsManager } from '@/components/appointments/ProfessionalsManager'
import type { BlockedTime } from '@/lib/appointments/types'

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

type Tab = 'schedule' | 'staff' | 'availability-blocks' | 'blocked'

export default function AppointmentsSettingsPage() {
  const [tab,     setTab]     = useState<Tab>('availability-blocks')
  const [blocks,  setBlocks]  = useState<BlockedTime[]>([])
  const [loading, setLoading] = useState(false)

  // Block form
  const [blockStart,  setBlockStart]  = useState('')
  const [blockEnd,    setBlockEnd]    = useState('')
  const [blockReason, setBlockReason] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  async function loadBlocks() {
    setLoading(true)
    try {
      const res  = await fetch('/api/appointments/block')
      const data = await res.json()
      setBlocks(data.blocks ?? [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'blocked') loadBlocks()
  }, [tab])

  async function createBlock() {
    if (!blockStart || !blockEnd) { setError('Start and end time required'); return }
    if (new Date(blockStart) >= new Date(blockEnd)) { setError('Start must be before end'); return }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch('/api/appointments/block', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          start_time: new Date(blockStart).toISOString(),
          end_time:   new Date(blockEnd).toISOString(),
          reason:     blockReason || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setBlockStart(''); setBlockEnd(''); setBlockReason('')
      await loadBlocks()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setSaving(false)
    }
  }

  async function deleteBlock(id: string) {
    await fetch(`/api/appointments/block?id=${id}`, { method: 'DELETE' })
    await loadBlocks()
  }

  const TABS: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'staff',               label: 'Professionals',      icon: Users        },
    { id: 'availability-blocks', label: 'Availability Blocks', icon: LayoutGrid   },
    { id: 'schedule',            label: 'Schedule Rules',      icon: CalendarDays },
    { id: 'blocked',             label: 'Blocked Times',       icon: Ban          },
  ]

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Page header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-gold-400/10 flex items-center justify-center">
          <Settings className="w-5 h-5 text-gold-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Appointment Settings</h1>
          <p className="text-xs text-white/40">Manage professionals, availability blocks, and schedule controls</p>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 bg-graphite-800 border border-surface-border rounded-xl p-1 flex-wrap">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
              tab === id
                ? 'bg-gold-gradient text-graphite-900 shadow-sm'
                : 'text-white/40 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">

        {/* ── Tab: Professionals ── */}
        {tab === 'staff' && (
          <motion.div
            key="staff"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0  }}
            exit={{    opacity: 0, x: -8  }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 rounded-xl border border-gold-500/20 bg-gold-400/5 px-4 py-3">
              <Info className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
              <div className="text-xs text-white/50 space-y-1">
                <p>Add the <span className="text-white/70 font-medium">professionals, stylists, therapists, or employees</span> who perform services.</p>
                <p>After adding them here, create <span className="text-white/70 font-medium">Availability Blocks</span> to define when each professional is available for bookings.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">Professionals &amp; Employees</h2>
                <p className="text-xs text-white/40 mt-0.5">These are the people customers can book with.</p>
              </div>
              <ProfessionalsManager />
            </div>
          </motion.div>
        )}

        {/* ── Tab: Availability Blocks ── */}
        {tab === 'availability-blocks' && (
          <motion.div
            key="availability-blocks"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0  }}
            exit={{    opacity: 0, x: -8  }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 rounded-xl border border-gold-500/20 bg-gold-400/5 px-4 py-3">
              <Info className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
              <div className="text-xs text-white/50 space-y-1">
                <p><span className="text-white/70 font-medium">Recurring blocks</span> repeat every week on the selected day(s) and time window.</p>
                <p><span className="text-white/70 font-medium">One-time blocks</span> define a specific date range when a professional is available.</p>
                <p className="pt-0.5 text-white/35">Blocks can be assigned to a specific professional or apply to all staff. Slot duration controls how long each bookable time slot is.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">Availability Blocks</h2>
                <p className="text-xs text-white/40 mt-0.5">Define when your professionals are available for appointments.</p>
              </div>
              <AvailabilityBlocksManager />
            </div>
          </motion.div>
        )}

        {/* ── Tab: Schedule Rules (legacy) ── */}
        {tab === 'schedule' && (
          <motion.div
            key="schedule"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0  }}
            exit={{    opacity: 0, x: -8  }}
            className="space-y-4"
          >
            <div className="flex items-start gap-3 rounded-xl border border-gold-500/20 bg-gold-400/5 px-4 py-3">
              <Info className="w-4 h-4 text-gold-400 shrink-0 mt-0.5" />
              <div className="text-xs text-white/50 space-y-1">
                <p>These are <span className="text-white/70 font-medium">legacy business-wide schedule rules</span> without professional assignment.</p>
                <p>For multi-professional scheduling, prefer the <span className="text-white/70 font-medium">Availability Blocks</span> tab above.</p>
                <p><span className="text-white/70 font-medium">Weekly</span> — repeats on a single fixed weekday.</p>
                <p><span className="text-white/70 font-medium">Daily</span> — applies every day of the week.</p>
                <p><span className="text-white/70 font-medium">Custom</span> — choose any combination of days.</p>
              </div>
            </div>
            <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-5">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-white">Availability Rules</h2>
                <p className="text-xs text-white/40 mt-0.5">
                  Customers can only book within these windows when no professional is selected.
                </p>
              </div>
              <AvailabilityEditor />
            </div>
            <div className="flex items-center gap-2 text-xs text-white/25 px-1">
              <Clock className="w-3 h-3 shrink-0" />
              <span>Changes take effect immediately — customers will see updated slots on their next refresh.</span>
            </div>
          </motion.div>
        )}

        {/* ── Tab: Blocked Times ── */}
        {tab === 'blocked' && (
          <motion.div
            key="blocked"
            initial={{ opacity: 0, x: 8  }}
            animate={{ opacity: 1, x: 0  }}
            exit={{    opacity: 0, x: 8  }}
            className="space-y-4"
          >
            {/* Add block form */}
            <div className="rounded-2xl border border-surface-border bg-graphite-800/40 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white">Block a Time Range</h2>
                <p className="text-xs text-white/40 mt-0.5">
                  Blocked times prevent all bookings during that window, overriding your schedule rules.
                </p>
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">
                    <Clock className="inline w-3 h-3 mr-1" />Start
                  </label>
                  <input
                    type="datetime-local"
                    value={blockStart}
                    onChange={(e) => setBlockStart(e.target.value)}
                    className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">
                    <Clock className="inline w-3 h-3 mr-1" />End
                  </label>
                  <input
                    type="datetime-local"
                    value={blockEnd}
                    onChange={(e) => setBlockEnd(e.target.value)}
                    className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Reason (optional)</label>
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="e.g. Holiday closure, maintenance, training day…"
                  className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors"
                />
              </div>

              <button
                onClick={createBlock}
                disabled={saving}
                className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
              >
                <Plus className="w-3.5 h-3.5" />
                {saving ? 'Adding…' : 'Add Block'}
              </button>
            </div>

            {/* Existing blocks list */}
            <div className="rounded-2xl border border-surface-border bg-graphite-800/40 overflow-hidden">
              <div className="px-5 py-3 border-b border-surface-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">Blocked Periods</h2>
                {blocks.length > 0 && (
                  <span className="text-2xs text-white/30 border border-surface-border rounded-full px-2 py-0.5">
                    {blocks.length}
                  </span>
                )}
              </div>

              {loading ? (
                <div className="px-5 py-8 text-center text-white/30 text-sm animate-pulse">Loading…</div>
              ) : blocks.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <Ban className="w-7 h-7 text-white/10 mx-auto mb-2" />
                  <p className="text-sm text-white/30">No blocked periods configured</p>
                </div>
              ) : (
                <div className="divide-y divide-surface-border/40">
                  <AnimatePresence initial={false}>
                    {blocks.map((block) => (
                      <motion.div
                        key={block.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{    opacity: 0, height: 0 }}
                        className="flex items-center gap-3 px-5 py-3 hover:bg-graphite-700/20 transition-colors"
                      >
                        <div className="h-7 w-7 rounded-lg bg-red-400/10 flex items-center justify-center shrink-0">
                          <Ban className="w-3.5 h-3.5 text-red-400/70" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white/80">
                            {fmtDT(block.start_time)} <span className="text-white/30">→</span> {fmtDT(block.end_time)}
                          </p>
                          {block.reason && (
                            <p className="text-xs text-white/40 mt-0.5 truncate">{block.reason}</p>
                          )}
                        </div>
                        <button
                          onClick={() => deleteBlock(block.id)}
                          className="h-7 w-7 rounded-lg bg-red-400/10 hover:bg-red-400/20 flex items-center justify-center transition-colors shrink-0"
                          title="Remove block"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
