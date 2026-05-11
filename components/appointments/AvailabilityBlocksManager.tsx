// components/appointments/AvailabilityBlocksManager.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Clock, User, RefreshCw, CalendarDays, Repeat,
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
  Zap, Ban, AlertCircle,
} from 'lucide-react'
import type { AppointmentAvailabilityBlock, AppointmentBlockType, Professional } from '@/lib/appointments/types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
]

const BLOCK_TYPE_META: Record<AppointmentBlockType, { label: string; color: string; bg: string; icon: React.ElementType; desc: string }> = {
  available:   { label: 'Available',   color: 'text-emerald-400', bg: 'bg-emerald-400/10 border-emerald-500/20', icon: CheckCircle2,  desc: 'Customers can book during this time' },
  unavailable: { label: 'Unavailable', color: 'text-amber-400',   bg: 'bg-amber-400/10 border-amber-500/20',     icon: XCircle,       desc: 'No bookings accepted during this time' },
  blackout:    { label: 'Blackout',    color: 'text-red-400',     bg: 'bg-red-400/10 border-red-500/20',         icon: Ban,           desc: 'Overrides all available blocks (e.g. holiday)' },
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const hh     = h % 12 || 12
  return `${hh}:${String(m).padStart(2, '0')} ${suffix}`
}

function fmtDT(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

interface BlockFormData {
  staffId:              string
  title:                string
  description:          string
  blockType:            AppointmentBlockType
  isRecurring:          boolean
  dayOfWeek:            number
  startTime:            string
  endTime:              string
  startsAt:             string
  endsAt:               string
  timezone:             string
  slotDurationMinutes:  number
  bufferBeforeMinutes:  number
  bufferAfterMinutes:   number
  maxBookingsPerSlot:   number
  isActive:             boolean
}

const EMPTY_FORM: BlockFormData = {
  staffId:             '',
  title:               '',
  description:         '',
  blockType:           'available',
  isRecurring:         true,
  dayOfWeek:           1,
  startTime:           '09:00',
  endTime:             '17:00',
  startsAt:            '',
  endsAt:              '',
  timezone:            'America/Los_Angeles',
  slotDurationMinutes: 30,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes:  0,
  maxBookingsPerSlot:  1,
  isActive:            true,
}

// Quick-create preset definitions
interface Preset {
  label:  string
  icon:   string
  apply:  Partial<BlockFormData>
  days?:  number[]  // multiple days → create one block per day
}

const PRESETS: Preset[] = [
  {
    label: 'Mon–Fri 9AM–5PM',
    icon:  '🗓',
    apply: { blockType: 'available', isRecurring: true, startTime: '09:00', endTime: '17:00', slotDurationMinutes: 30, isActive: true },
    days:  [1, 2, 3, 4, 5],
  },
  {
    label: 'Mon–Fri 10AM–6PM',
    icon:  '🗓',
    apply: { blockType: 'available', isRecurring: true, startTime: '10:00', endTime: '18:00', slotDurationMinutes: 30, isActive: true },
    days:  [1, 2, 3, 4, 5],
  },
  {
    label: 'Weekends 10AM–4PM',
    icon:  '🌅',
    apply: { blockType: 'available', isRecurring: true, startTime: '10:00', endTime: '16:00', slotDurationMinutes: 30, isActive: true },
    days:  [0, 6],
  },
  {
    label: 'Lunch Blackout 12–1PM',
    icon:  '🚫',
    apply: { blockType: 'blackout', isRecurring: true, startTime: '12:00', endTime: '13:00', isActive: true },
    days:  [1, 2, 3, 4, 5],
  },
  {
    label: 'Full Day Blackout',
    icon:  '❌',
    apply: { blockType: 'blackout', isRecurring: false, isActive: true },
  },
  {
    label: 'Custom Block',
    icon:  '✏️',
    apply: {},
  },
]

export function AvailabilityBlocksManager() {
  const [blocks,        setBlocks]        = useState<AppointmentAvailabilityBlock[]>([])
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [editing,       setEditing]       = useState<AppointmentAvailabilityBlock | null>(null)
  const [form,          setForm]          = useState<BlockFormData>(EMPTY_FORM)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [filterStaff,   setFilterStaff]   = useState('')
  const [filterType,    setFilterType]    = useState<AppointmentBlockType | ''>('')
  const [showAll,       setShowAll]       = useState(false)
  const [showPresets,   setShowPresets]   = useState(false)
  const [applyingPreset, setApplyingPreset] = useState(false)
  const [showAdvanced,  setShowAdvanced]  = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [blocksRes, profRes] = await Promise.all([
        fetch('/api/appointments/availability-blocks?active=' + (showAll ? '' : 'true')).then((r) => r.json()),
        fetch('/api/professionals?active=false').then((r) => r.json()),
      ])
      setBlocks(blocksRes.data?.blocks ?? [])
      setProfessionals(profRes.data?.professionals ?? [])
    } finally {
      setLoading(false)
    }
  }, [showAll])

  useEffect(() => { load() }, [load])

  function openNew(overrides: Partial<BlockFormData> = {}) {
    setEditing(null)
    setForm({ ...EMPTY_FORM, ...overrides })
    setError(null)
    setShowPresets(false)
    setShowAdvanced(false)
    setShowForm(true)
  }

  function openEdit(block: AppointmentAvailabilityBlock) {
    setEditing(block)
    setForm({
      staffId:             block.staff_id ?? '',
      title:               block.title    ?? '',
      description:         block.description ?? '',
      blockType:           (block.block_type as AppointmentBlockType) ?? 'available',
      isRecurring:         block.is_recurring,
      dayOfWeek:           block.day_of_week  ?? 1,
      startTime:           block.start_time   ?? '09:00',
      endTime:             block.end_time     ?? '17:00',
      startsAt:            block.starts_at    ? new Date(block.starts_at).toISOString().slice(0, 16) : '',
      endsAt:              block.ends_at      ? new Date(block.ends_at).toISOString().slice(0, 16)   : '',
      timezone:            block.timezone,
      slotDurationMinutes: block.slot_duration_minutes,
      bufferBeforeMinutes: block.buffer_before_minutes,
      bufferAfterMinutes:  block.buffer_after_minutes,
      maxBookingsPerSlot:  block.max_bookings_per_slot,
      isActive:            block.is_active,
    })
    setError(null)
    setShowAdvanced(false)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setError(null)
  }

  function setField<K extends keyof BlockFormData>(key: K, val: BlockFormData[K]) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function applyPreset(preset: Preset) {
    if (!preset.days || preset.days.length <= 1) {
      openNew({ ...preset.apply, dayOfWeek: preset.days?.[0] ?? form.dayOfWeek })
      return
    }

    // Multi-day preset: create one block per day
    if (!confirm(`This will create ${preset.days.length} blocks (one for each day). Continue?`)) return

    setApplyingPreset(true)
    setShowPresets(false)
    try {
      for (const day of preset.days) {
        await fetch('/api/appointments/availability-blocks', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            ...presetToPayload(preset, day),
            staffId: form.staffId || null,
          }),
        })
      }
      await load()
    } finally {
      setApplyingPreset(false)
    }
  }

  function presetToPayload(preset: Preset, dayOfWeek: number) {
    return {
      blockType:           preset.apply.blockType           ?? 'available',
      isRecurring:         preset.apply.isRecurring          ?? true,
      dayOfWeek,
      startTime:           preset.apply.startTime            ?? '09:00',
      endTime:             preset.apply.endTime              ?? '17:00',
      slotDurationMinutes: preset.apply.slotDurationMinutes ?? 30,
      isActive:            preset.apply.isActive             ?? true,
    }
  }

  async function handleSave() {
    setError(null)
    if (form.isRecurring) {
      if (!form.startTime || !form.endTime) { setError('Start and end time are required'); return }
      if (form.startTime >= form.endTime)   { setError('Start time must be before end time'); return }
    } else {
      if (!form.startsAt || !form.endsAt) { setError('Start and end date/time are required'); return }
      if (new Date(form.startsAt) >= new Date(form.endsAt)) { setError('Start must be before end'); return }
    }

    setSaving(true)
    try {
      const payload = {
        staffId:             form.staffId    || null,
        title:               form.title      || null,
        description:         form.description || null,
        blockType:           form.blockType,
        isRecurring:         form.isRecurring,
        dayOfWeek:           form.isRecurring ? form.dayOfWeek : null,
        startTime:           form.isRecurring ? form.startTime : null,
        endTime:             form.isRecurring ? form.endTime   : null,
        startsAt:            form.isRecurring ? null : new Date(form.startsAt).toISOString(),
        endsAt:              form.isRecurring ? null : new Date(form.endsAt).toISOString(),
        timezone:            form.timezone,
        slotDurationMinutes: form.slotDurationMinutes,
        bufferBeforeMinutes: form.bufferBeforeMinutes,
        bufferAfterMinutes:  form.bufferAfterMinutes,
        maxBookingsPerSlot:  form.maxBookingsPerSlot,
        isActive:            form.isActive,
      }

      const url    = editing ? `/api/appointments/availability-blocks/${editing.id}` : '/api/appointments/availability-blocks'
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data   = await res.json()

      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Failed to save')
      closeForm()
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(block: AppointmentAvailabilityBlock) {
    await fetch(`/api/appointments/availability-blocks/${block.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isActive: !block.is_active }),
    })
    await load()
  }

  async function handleDelete(block: AppointmentAvailabilityBlock) {
    if (!confirm('Deactivate this availability block? It can be re-enabled later.')) return
    await fetch(`/api/appointments/availability-blocks/${block.id}`, { method: 'DELETE' })
    await load()
  }

  const filtered = blocks.filter((b) => {
    const matchStaff = !filterStaff || b.staff_id === filterStaff || (!b.staff_id && filterStaff === '__none__')
    const matchType  = !filterType  || b.block_type === filterType
    return matchStaff && matchType
  })

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Filters */}
          <div className="flex flex-1 flex-wrap gap-2">
            <select
              value={filterStaff}
              onChange={(e) => setFilterStaff(e.target.value)}
              className="h-9 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
            >
              <option value="">All professionals</option>
              <option value="__none__">General (all staff)</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as AppointmentBlockType | '')}
              className="h-9 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
            >
              <option value="">All types</option>
              <option value="available">Available</option>
              <option value="unavailable">Unavailable</option>
              <option value="blackout">Blackout</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowAll((v) => !v)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-graphite-700 border border-surface-border text-xs text-white/50 hover:text-white transition-colors"
            >
              {showAll ? <ToggleRight className="w-3.5 h-3.5 text-gold-400" /> : <ToggleLeft className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">Show inactive</span>
            </button>

            <button
              onClick={load}
              disabled={loading}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-graphite-700 border border-surface-border text-white/40 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>

            {/* Quick presets */}
            <div className="relative">
              <button
                onClick={() => setShowPresets((v) => !v)}
                disabled={applyingPreset}
                className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-graphite-700 border border-surface-border text-xs text-white/60 hover:text-white transition-colors disabled:opacity-50"
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Quick</span>
                {showPresets ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              <AnimatePresence>
                {showPresets && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0,  scale: 1    }}
                    exit={{    opacity: 0, y: -4, scale: 0.97 }}
                    className="absolute right-0 top-10 z-50 w-64 bg-graphite-800 border border-surface-border rounded-xl shadow-panel-lg overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-surface-border text-2xs text-white/30 uppercase tracking-wider font-medium">
                      Quick create
                    </div>
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        onClick={() => applyPreset(preset)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-graphite-700/60 transition-colors"
                      >
                        <span className="text-base">{preset.icon}</span>
                        <span className="text-sm text-white/80">{preset.label}</span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={() => openNew()}
              className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Block
            </button>
          </div>
        </div>

        {/* No professionals banner */}
        {!loading && professionals.length === 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              <strong>Tip:</strong> Add professionals/employees first so you can assign availability blocks to specific team members.
              Go to the <strong>Professionals</strong> tab.
            </span>
          </div>
        )}
      </div>

      {/* Block list */}
      <div className="rounded-2xl border border-surface-border overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-white/30 text-sm animate-pulse">Loading availability blocks…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-14 text-center space-y-3">
            <CalendarDays className="w-10 h-10 text-white/10 mx-auto" />
            <div>
              <p className="text-sm text-white/30">No availability blocks yet</p>
              <p className="text-xs text-white/20 mt-1">Use "Add Block" or "Quick" presets to get started</p>
            </div>
            <button
              onClick={() => openNew()}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-xs font-semibold hover:shadow-glow-gold transition-shadow"
            >
              <Plus className="w-3 h-3" />Create your first block
            </button>
          </div>
        ) : (
          <div className="divide-y divide-surface-border/40">
            <AnimatePresence initial={false}>
              {filtered.map((block) => {
                const prof = professionals.find((p) => p.id === block.staff_id)
                const typeMeta = BLOCK_TYPE_META[(block.block_type as AppointmentBlockType) ?? 'available']
                const TypeIcon = typeMeta.icon

                return (
                  <motion.div
                    key={block.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{    opacity: 0 }}
                    className={`flex items-start gap-3 px-4 py-4 transition-colors hover:bg-graphite-700/20 ${
                      !block.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    {/* Type icon */}
                    <div className={`h-8 w-8 rounded-lg border flex items-center justify-center shrink-0 mt-0.5 ${typeMeta.bg}`}>
                      <TypeIcon className={`w-4 h-4 ${typeMeta.color}`} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="text-sm font-medium text-white">
                          {block.title || (block.is_recurring ? DAY_NAMES[block.day_of_week ?? 0] : 'One-time block')}
                        </span>
                        <span className={`px-2 py-0.5 rounded-full text-2xs font-medium border ${typeMeta.bg} ${typeMeta.color}`}>
                          {typeMeta.label}
                        </span>
                        {block.is_recurring ? (
                          <span className="flex items-center gap-0.5 text-2xs text-white/30">
                            <Repeat className="w-2.5 h-2.5" />Recurring
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-2xs text-white/30">
                            <CalendarDays className="w-2.5 h-2.5" />One-time
                          </span>
                        )}
                        {!block.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-2xs font-medium bg-graphite-700 text-white/30 border border-surface-border">
                            Inactive
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40">
                        {block.is_recurring && block.day_of_week !== null ? (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="w-3 h-3" />
                            {DAY_NAMES[block.day_of_week]}
                            {block.start_time && block.end_time && (
                              <> · {fmtTime(block.start_time)} – {fmtTime(block.end_time)}</>
                            )}
                          </span>
                        ) : block.starts_at && block.ends_at ? (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {fmtDT(block.starts_at)} – {fmtDT(block.ends_at)}
                          </span>
                        ) : null}

                        {prof ? (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {prof.name}
                          </span>
                        ) : (
                          <span className="text-white/20 italic">All staff</span>
                        )}

                        {block.block_type === 'available' && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {block.slot_duration_minutes}min slots · max {block.max_bookings_per_slot} booking{block.max_bookings_per_slot !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      {block.description && (
                        <p className="text-xs text-white/30 line-clamp-1">{block.description}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggle(block)}
                        title={block.is_active ? 'Disable' : 'Enable'}
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-graphite-700 transition-colors"
                      >
                        {block.is_active
                          ? <ToggleRight className="w-4 h-4 text-gold-400" />
                          : <ToggleLeft  className="w-4 h-4 text-white/30" />
                        }
                      </button>
                      <button
                        onClick={() => openEdit(block)}
                        title="Edit"
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-graphite-700 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-white/40 hover:text-white" />
                      </button>
                      <button
                        onClick={() => handleDelete(block)}
                        title="Deactivate"
                        className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-white/30 hover:text-red-400" />
                      </button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Summary */}
      {filtered.length > 0 && (
        <p className="text-xs text-white/25 text-right">
          {filtered.length} block{filtered.length !== 1 ? 's' : ''}
          {(filterStaff || filterType) ? ' (filtered)' : ''}
        </p>
      )}

      {/* Create / Edit Form Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-12 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{    opacity: 0 }}
              onClick={closeForm}
              className="fixed inset-0 bg-graphite-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 16 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{    opacity: 0, scale: 0.96, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative w-full max-w-lg bg-graphite-800 border border-surface-border rounded-2xl shadow-panel-lg overflow-hidden mb-4"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gold-gradient opacity-60" />

              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {editing ? 'Edit Availability Block' : 'Create Availability Block'}
                  </h2>
                  <p className="text-xs text-white/40 mt-0.5">
                    {editing ? 'Update the block settings below' : 'Define a time window for appointment booking'}
                  </p>
                </div>
                <button
                  onClick={closeForm}
                  className="h-8 w-8 rounded-lg bg-graphite-700 hover:bg-graphite-600 flex items-center justify-center transition-colors text-white/50 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Modal body */}
              <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
                {error && (
                  <div className="flex items-start gap-2 rounded-lg bg-red-400/10 border border-red-400/20 px-3 py-2 text-xs text-red-400">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    {error}
                  </div>
                )}

                {/* Block type */}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">Block Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(Object.entries(BLOCK_TYPE_META) as Array<[AppointmentBlockType, typeof BLOCK_TYPE_META['available']]>).map(([type, meta]) => {
                      const Icon = meta.icon
                      return (
                        <button
                          key={type}
                          onClick={() => setField('blockType', type)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-medium transition-all ${
                            form.blockType === type
                              ? `${meta.bg} ${meta.color} border-current`
                              : 'bg-graphite-700/50 border-surface-border text-white/40 hover:text-white/70 hover:border-white/10'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {meta.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-1.5 text-xs text-white/30">
                    {BLOCK_TYPE_META[form.blockType].desc}
                  </p>
                </div>

                {/* Professional */}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">
                    <User className="inline w-3 h-3 mr-1" />Professional / Employee
                  </label>
                  <select
                    value={form.staffId}
                    onChange={(e) => setField('staffId', e.target.value)}
                    className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                  >
                    <option value="">All staff (no specific professional)</option>
                    {professionals.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}{p.role !== 'staff' ? ` (${p.role})` : ''}</option>
                    ))}
                  </select>
                </div>

                {/* Title + description */}
                <div className="grid grid-cols-1 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Block Title (optional)</label>
                    <input
                      type="text"
                      value={form.title}
                      onChange={(e) => setField('title', e.target.value)}
                      placeholder="e.g. Morning Appointments, Holiday Closure"
                      className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Description (optional)</label>
                    <input
                      type="text"
                      value={form.description}
                      onChange={(e) => setField('description', e.target.value)}
                      placeholder="Internal notes about this block"
                      className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Recurring toggle */}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-2">Schedule Type</label>
                  <div className="flex rounded-xl bg-graphite-700 border border-surface-border p-0.5">
                    {[
                      { val: true,  icon: Repeat,       label: 'Recurring Weekly' },
                      { val: false, icon: CalendarDays,  label: 'One-time'        },
                    ].map(({ val, icon: Icon, label }) => (
                      <button
                        key={String(val)}
                        onClick={() => setField('isRecurring', val)}
                        className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-medium transition-all ${
                          form.isRecurring === val
                            ? 'bg-gold-gradient text-graphite-900 shadow-sm'
                            : 'text-white/40 hover:text-white/70'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recurring fields */}
                {form.isRecurring ? (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Day of Week</label>
                      <div className="flex flex-wrap gap-1.5">
                        {DAY_SHORT.map((day, i) => (
                          <button
                            key={i}
                            onClick={() => setField('dayOfWeek', i)}
                            className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all ${
                              form.dayOfWeek === i
                                ? 'bg-gold-gradient text-graphite-900'
                                : 'bg-graphite-700 text-white/40 hover:text-white border border-surface-border'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1.5">Start Time</label>
                        <input
                          type="time"
                          value={form.startTime}
                          onChange={(e) => setField('startTime', e.target.value)}
                          style={{ colorScheme: 'dark' }}
                          className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-white/50 mb-1.5">End Time</label>
                        <input
                          type="time"
                          value={form.endTime}
                          onChange={(e) => setField('endTime', e.target.value)}
                          style={{ colorScheme: 'dark' }}
                          className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Start Date/Time</label>
                      <input
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(e) => setField('startsAt', e.target.value)}
                        style={{ colorScheme: 'dark' }}
                        className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">End Date/Time</label>
                      <input
                        type="datetime-local"
                        value={form.endsAt}
                        onChange={(e) => setField('endsAt', e.target.value)}
                        style={{ colorScheme: 'dark' }}
                        className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Available-block-only settings */}
                {form.blockType === 'available' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">
                        Slot Duration (min)
                      </label>
                      <select
                        value={form.slotDurationMinutes}
                        onChange={(e) => setField('slotDurationMinutes', Number(e.target.value))}
                        className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                      >
                        {[15, 20, 30, 45, 60, 90, 120].map((v) => (
                          <option key={v} value={v}>{v} min</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Max Bookings / Slot</label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={form.maxBookingsPerSlot}
                        onChange={(e) => setField('maxBookingsPerSlot', Number(e.target.value))}
                        className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* Advanced settings */}
                <div>
                  <button
                    onClick={() => setShowAdvanced((v) => !v)}
                    className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    Advanced settings
                  </button>

                  <AnimatePresence>
                    {showAdvanced && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{    opacity: 0, height: 0 }}
                        className="space-y-3 mt-3 overflow-hidden"
                      >
                        {form.blockType === 'available' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-white/50 mb-1.5">Buffer Before (min)</label>
                              <input
                                type="number"
                                min={0}
                                value={form.bufferBeforeMinutes}
                                onChange={(e) => setField('bufferBeforeMinutes', Number(e.target.value))}
                                className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-white/50 mb-1.5">Buffer After (min)</label>
                              <input
                                type="number"
                                min={0}
                                value={form.bufferAfterMinutes}
                                onChange={(e) => setField('bufferAfterMinutes', Number(e.target.value))}
                                className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                              />
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-white/50 mb-1.5">Timezone</label>
                          <select
                            value={form.timezone}
                            onChange={(e) => setField('timezone', e.target.value)}
                            className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                          >
                            {TIMEZONES.map((tz) => (
                              <option key={tz} value={tz}>{tz}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center justify-between rounded-xl bg-graphite-700/50 border border-surface-border px-4 py-3">
                          <div>
                            <p className="text-sm text-white/80 font-medium">Active</p>
                            <p className="text-xs text-white/40">Inactive blocks are hidden from customers</p>
                          </div>
                          <button
                            onClick={() => setField('isActive', !form.isActive)}
                            className={`h-6 w-10 rounded-full transition-colors relative ${form.isActive ? 'bg-gold-500' : 'bg-graphite-600'}`}
                          >
                            <div className={`absolute top-0.5 left-0.5 h-5 w-5 bg-white rounded-full shadow transition-transform ${form.isActive ? 'translate-x-4' : 'translate-x-0'}`} />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Modal footer — sticky save button */}
              <div className="sticky bottom-0 px-6 py-4 border-t border-surface-border bg-graphite-800 flex items-center justify-between gap-3">
                <button
                  onClick={closeForm}
                  className="h-9 px-4 rounded-xl bg-graphite-700 text-white/60 text-sm hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 h-9 px-6 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
                >
                  {saving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  )}
                  {saving ? 'Saving…' : editing ? 'Update Block' : 'Create Block'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
