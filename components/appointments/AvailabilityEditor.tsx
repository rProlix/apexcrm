// components/appointments/AvailabilityEditor.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, RefreshCw, Save, Copy } from 'lucide-react'
import type { AvailabilityRule, RepeatType } from '@/lib/appointments/types'

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_FULL  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const SLOT_OPTIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120]
const REPEAT_TYPES: Array<{ value: RepeatType; label: string; desc: string }> = [
  { value: 'weekly', label: 'Weekly',  desc: 'Repeats on a fixed day of the week' },
  { value: 'daily',  label: 'Daily',   desc: 'Repeats every day'                  },
  { value: 'custom', label: 'Custom',  desc: 'Choose specific days'               },
]

// Unsaved rules have id = '' (new); saved rules have a real UUID.
type DraftRule = Omit<AvailabilityRule, 'created_at' | 'updated_at'> & {
  _dirty: boolean  // track unsaved local changes
}

function freshRule(): DraftRule {
  return {
    id:                    '',
    tenant_id:             '',
    day_of_week:           1,   // Monday
    start_time:            '09:00',
    end_time:              '17:00',
    slot_interval_minutes: 30,
    repeat_type:           'weekly',
    repeat_days:           [],
    is_active:             true,
    _dirty:                true,
  }
}

interface Props {
  onSaved?: () => void
}

export function AvailabilityEditor({ onSaved }: Props) {
  const [rules,   setRules]   = useState<DraftRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null)  // rule id being saved
  const [error,   setError]   = useState<string | null>(null)

  // ── Load rules ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/appointments/availability-rules')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load')
      setRules(
        (data.rules ?? []).map((r: AvailabilityRule) => ({
          ...r,
          repeat_days: Array.isArray(r.repeat_days) ? r.repeat_days : [],
          _dirty: false,
        }))
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load rules')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Mutations ──────────────────────────────────────────────────────────────
  function updateRule(idx: number, patch: Partial<DraftRule>) {
    setRules((prev) =>
      prev.map((r, i) => i === idx ? { ...r, ...patch, _dirty: true } : r)
    )
  }

  function addRule() {
    setRules((prev) => [...prev, freshRule()])
  }

  function duplicateRule(idx: number) {
    setRules((prev) => {
      const copy = { ...prev[idx], id: '', _dirty: true }
      const next = [...prev]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  async function deleteRule(idx: number) {
    const rule = rules[idx]

    // New unsaved rule — just remove from local state
    if (!rule.id) {
      setRules((prev) => prev.filter((_, i) => i !== idx))
      return
    }

    setSaving(rule.id)
    try {
      const res = await fetch(`/api/appointments/availability-rules?id=${rule.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Delete failed')
      }
      setRules((prev) => prev.filter((_, i) => i !== idx))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setSaving(null)
    }
  }

  async function saveRule(idx: number) {
    const rule = rules[idx]
    setError(null)

    if (rule.start_time >= rule.end_time) {
      setError(`Rule ${idx + 1}: start time must be before end time`)
      return
    }

    setSaving(rule.id || `new-${idx}`)
    try {
      let res: Response

      if (!rule.id) {
        // Create
        res = await fetch('/api/appointments/availability-rules', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(rule),
        })
      } else {
        // Update
        res = await fetch(`/api/appointments/availability-rules?id=${rule.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(rule),
        })
      }

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Save failed')

      // Merge saved rule back into state
      const saved = data.rule as AvailabilityRule
      setRules((prev) =>
        prev.map((r, i) =>
          i === idx
            ? { ...saved, repeat_days: Array.isArray(saved.repeat_days) ? saved.repeat_days : [], _dirty: false }
            : r
        )
      )
      onSaved?.()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(null)
    }
  }

  function toggleCustomDay(idx: number, day: number) {
    const rule = rules[idx]
    const days = Array.isArray(rule.repeat_days) ? rule.repeat_days : []
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort()
    updateRule(idx, { repeat_days: next })
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2"
        >
          {error}
        </motion.p>
      )}

      {/* Rule list */}
      <AnimatePresence initial={false}>
        {rules.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-xl border border-dashed border-surface-border px-6 py-10 text-center"
          >
            <p className="text-sm text-white/30">No availability rules yet.</p>
            <p className="text-xs text-white/20 mt-1">Add a rule to define your working hours.</p>
          </motion.div>
        )}

        {rules.map((rule, idx) => {
          const isSaving   = saving === rule.id || saving === `new-${idx}`
          const repeatType = rule.repeat_type ?? 'weekly'

          return (
            <motion.div
              key={rule.id || `new-${idx}`}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0  }}
              exit={{    opacity: 0, y: -8  }}
              transition={{ duration: 0.18 }}
              className={`
                rounded-2xl border p-4 space-y-3 transition-colors
                ${rule.is_active
                  ? 'bg-graphite-700/50 border-gold-500/20'
                  : 'bg-graphite-800/30 border-surface-border opacity-60'}
                ${rule._dirty ? 'ring-1 ring-gold-500/20' : ''}
              `}
            >
              {/* ── Row 1: toggle + label + actions ── */}
              <div className="flex items-center gap-3">
                {/* Active toggle */}
                <button
                  type="button"
                  onClick={() => updateRule(idx, { is_active: !rule.is_active })}
                  className={`relative h-5 w-9 rounded-full shrink-0 transition-colors ${
                    rule.is_active ? 'bg-gold-gradient' : 'bg-graphite-600'
                  }`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    rule.is_active ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>

                {/* Rule label */}
                <span className="flex-1 text-sm font-medium text-white">
                  {repeatType === 'daily'
                    ? 'Every Day'
                    : repeatType === 'custom'
                    ? (rule.repeat_days?.length
                        ? rule.repeat_days.map((d) => DAY_SHORT[d]).join(', ')
                        : 'Custom — no days selected')
                    : DAY_FULL[rule.day_of_week] ?? 'Weekday'}
                  {' '}
                  <span className="text-white/30 font-normal text-xs">
                    {rule.start_time} – {rule.end_time}
                  </span>
                </span>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {rule._dirty && (
                    <button
                      onClick={() => saveRule(idx)}
                      disabled={isSaving}
                      title="Save rule"
                      className="flex items-center gap-1 h-7 px-2.5 rounded-lg bg-gold-gradient text-graphite-900 text-2xs font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" />
                      {isSaving ? '…' : 'Save'}
                    </button>
                  )}
                  <button
                    onClick={() => duplicateRule(idx)}
                    title="Duplicate rule"
                    className="h-7 w-7 rounded-lg bg-graphite-600/50 hover:bg-graphite-600 flex items-center justify-center transition-colors"
                  >
                    <Copy className="w-3 h-3 text-white/40 hover:text-white" />
                  </button>
                  <button
                    onClick={() => deleteRule(idx)}
                    disabled={isSaving}
                    title="Delete rule"
                    className="h-7 w-7 rounded-lg bg-red-400/10 hover:bg-red-400/20 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </button>
                </div>
              </div>

              {/* ── Row 2: time window + slot interval ── */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-white/40 uppercase tracking-wider shrink-0">Hours</span>
                  <input
                    type="time"
                    value={rule.start_time}
                    disabled={!rule.is_active}
                    onChange={(e) => updateRule(idx, { start_time: e.target.value })}
                    className="h-8 px-2 w-24 bg-graphite-700 border border-surface-border rounded-lg text-xs text-white focus:outline-none focus:border-gold-500/50 disabled:opacity-40 transition-colors"
                  />
                  <span className="text-white/30 text-xs">–</span>
                  <input
                    type="time"
                    value={rule.end_time}
                    disabled={!rule.is_active}
                    onChange={(e) => updateRule(idx, { end_time: e.target.value })}
                    className="h-8 px-2 w-24 bg-graphite-700 border border-surface-border rounded-lg text-xs text-white focus:outline-none focus:border-gold-500/50 disabled:opacity-40 transition-colors"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-2xs text-white/40 uppercase tracking-wider shrink-0">Slot</span>
                  <select
                    value={rule.slot_interval_minutes}
                    disabled={!rule.is_active}
                    onChange={(e) => updateRule(idx, { slot_interval_minutes: parseInt(e.target.value) })}
                    className="h-8 px-2 bg-graphite-700 border border-surface-border rounded-lg text-xs text-white focus:outline-none focus:border-gold-500/50 disabled:opacity-40 transition-colors"
                  >
                    {SLOT_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60}h`}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── Row 3: repeat type ── */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-2xs text-white/40 uppercase tracking-wider shrink-0">Repeat</span>
                <div className="flex gap-1">
                  {REPEAT_TYPES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      disabled={!rule.is_active}
                      onClick={() => updateRule(idx, {
                        repeat_type: value,
                        repeat_days: value === 'custom' ? (rule.repeat_days?.length ? rule.repeat_days : [1]) : [],
                      })}
                      className={`h-7 px-2.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 ${
                        repeatType === value
                          ? 'bg-gold-500/20 border border-gold-500/40 text-gold-400'
                          : 'bg-graphite-700 border border-surface-border text-white/40 hover:text-white/70'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── Row 4: day selectors (conditional) ── */}
              <AnimatePresence initial={false}>
                {repeatType === 'weekly' && (
                  <motion.div
                    key="weekly-day"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{    opacity: 0, height: 0 }}
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <span className="text-2xs text-white/40 uppercase tracking-wider shrink-0">Day</span>
                    <div className="flex gap-1">
                      {DAY_SHORT.map((d, dayIdx) => (
                        <button
                          key={dayIdx}
                          type="button"
                          disabled={!rule.is_active}
                          onClick={() => updateRule(idx, { day_of_week: dayIdx })}
                          className={`h-7 w-9 rounded-lg text-xs font-medium transition-all disabled:opacity-40 ${
                            rule.day_of_week === dayIdx
                              ? 'bg-gold-gradient text-graphite-900 shadow-glow-gold'
                              : 'bg-graphite-700 border border-surface-border text-white/40 hover:text-white/70'
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}

                {repeatType === 'custom' && (
                  <motion.div
                    key="custom-days"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{    opacity: 0, height: 0 }}
                    className="flex items-center gap-2 flex-wrap"
                  >
                    <span className="text-2xs text-white/40 uppercase tracking-wider shrink-0">Days</span>
                    <div className="flex gap-1 flex-wrap">
                      {DAY_SHORT.map((d, dayIdx) => {
                        const selected = (rule.repeat_days ?? []).includes(dayIdx)
                        return (
                          <button
                            key={dayIdx}
                            type="button"
                            disabled={!rule.is_active}
                            onClick={() => toggleCustomDay(idx, dayIdx)}
                            className={`h-7 w-9 rounded-lg text-xs font-medium transition-all disabled:opacity-40 ${
                              selected
                                ? 'bg-gold-gradient text-graphite-900 shadow-glow-gold'
                                : 'bg-graphite-700 border border-surface-border text-white/40 hover:text-white/70'
                            }`}
                          >
                            {d}
                          </button>
                        )
                      })}
                    </div>
                    {(rule.repeat_days?.length ?? 0) === 0 && (
                      <span className="text-2xs text-amber-400/70 ml-1">Select at least one day</span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Add rule button */}
      <button
        onClick={addRule}
        className="flex items-center gap-2 h-10 px-4 rounded-xl border border-dashed border-gold-500/30 text-gold-400/70 text-sm font-medium hover:border-gold-500/50 hover:text-gold-400 hover:bg-gold-400/5 transition-all w-full justify-center"
      >
        <Plus className="w-4 h-4" />
        Add Availability Block
      </button>

      {/* Save all dirty rules shortcut */}
      {rules.some((r) => r._dirty) && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between rounded-xl border border-gold-500/20 bg-gold-400/5 px-4 py-3"
        >
          <p className="text-xs text-gold-400/80">
            {rules.filter((r) => r._dirty).length} unsaved change{rules.filter((r) => r._dirty).length !== 1 ? 's' : ''}
          </p>
          <button
            onClick={async () => {
              for (let i = 0; i < rules.length; i++) {
                if (rules[i]._dirty) await saveRule(i)
              }
            }}
            disabled={!!saving}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-gold-gradient text-graphite-900 text-xs font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
          >
            <Save className="w-3 h-3" />
            Save All
          </button>
        </motion.div>
      )}
    </div>
  )
}
