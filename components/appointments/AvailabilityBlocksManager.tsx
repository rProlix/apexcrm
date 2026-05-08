// components/appointments/AvailabilityBlocksManager.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, ToggleLeft, ToggleRight,
  Clock, User, RefreshCw, CalendarDays, Repeat,
  CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from 'lucide-react'
import type { AppointmentAvailabilityBlock, Professional } from '@/lib/appointments/types'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
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
  const [showAll,       setShowAll]       = useState(false)

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

  function openNew() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(block: AppointmentAvailabilityBlock) {
    setEditing(block)
    setForm({
      staffId:             block.staff_id ?? '',
      title:               block.title    ?? '',
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
        staffId:             form.staffId || null,
        title:               form.title || null,
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

      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()

      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
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
    if (!confirm('Deactivate this availability block?')) return
    await fetch(`/api/appointments/availability-blocks/${block.id}`, { method: 'DELETE' })
    await load()
  }

  const filtered = blocks.filter((b) =>
    !filterStaff || b.staff_id === filterStaff || (!b.staff_id && filterStaff === '__none__')
  )

  return (
    <div className="space-y-4">
      {/* Header toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1">
          <select
            value={filterStaff}
            onChange={(e) => setFilterStaff(e.target.value)}
            className="h-9 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors w-full sm:w-auto"
          >
            <option value="">All professionals</option>
            <option value="__none__">No professional (all staff)</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowAll((v) => !v) }}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-graphite-700 border border-surface-border text-xs text-white/50 hover:text-white transition-colors"
          >
            {showAll ? <ToggleRight className="w-3.5 h-3.5 text-gold-400" /> : <ToggleLeft className="w-3.5 h-3.5" />}
            Show inactive
          </button>

          <button
            onClick={load}
            disabled={loading}
            className="h-9 w-9 flex items-center justify-center rounded-xl bg-graphite-700 border border-surface-border text-white/40 hover:text-white transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={openNew}
            className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Block
          </button>
        </div>
      </div>

      {/* No professionals yet */}
      {!loading && professionals.length === 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-300">
          <strong>Tip:</strong> Add professionals/employees first so you can assign availability blocks to them.
          Go to <strong>Staff settings</strong> or use the Professionals section to add team members.
        </div>
      )}

      {/* Blocks list */}
      <div className="rounded-2xl border border-surface-border overflow-hidden">
        {loading ? (
          <div className="px-5 py-12 text-center text-white/30 text-sm animate-pulse">Loading availability blocks…</div>
        ) : filtered.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CalendarDays className="w-8 h-8 text-white/10 mx-auto mb-2" />
            <p className="text-sm text-white/30">No availability blocks yet</p>
            <p className="text-xs text-white/20 mt-1">Create a block to define when appointments can be booked</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border/40">
            <AnimatePresence initial={false}>
              {filtered.map((block) => {
                const prof = professionals.find((p) => p.id === block.staff_id)

                return (
                  <motion.div
                    key={block.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className={`flex items-start gap-3 px-5 py-4 transition-colors hover:bg-graphite-700/20 ${
                      !block.is_active ? 'opacity-50' : ''
                    }`}
                  >
                    {/* Icon */}
                    <div className={`mt-0.5 h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                      block.is_recurring ? 'bg-blue-400/10' : 'bg-gold-400/10'
                    }`}>
                      {block.is_recurring
                        ? <Repeat className="w-4 h-4 text-blue-400" />
                        : <CalendarDays className="w-4 h-4 text-gold-400" />
                      }
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className="text-sm font-medium text-white">
                          {block.title || (block.is_recurring
                            ? `${DAY_NAMES[block.day_of_week ?? 0]}: ${block.start_time ? fmtTime(block.start_time) : '?'} – ${block.end_time ? fmtTime(block.end_time) : '?'}`
                            : `${block.starts_at ? fmtDT(block.starts_at) : '?'} – ${block.ends_at ? fmtDT(block.ends_at) : '?'}`
                          )}
                        </p>

                        <div className="flex gap-1.5">
                          <span className={`text-2xs px-2 py-0.5 rounded-full border font-medium ${
                            block.is_recurring
                              ? 'border-blue-500/30 text-blue-400 bg-blue-400/8'
                              : 'border-gold-500/30 text-gold-400 bg-gold-400/8'
                          }`}>
                            {block.is_recurring ? 'Recurring' : 'One-time'}
                          </span>

                          {block.is_active ? (
                            <span className="text-2xs px-2 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-400/8 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />Active
                            </span>
                          ) : (
                            <span className="text-2xs px-2 py-0.5 rounded-full border border-surface-border text-white/30 font-medium flex items-center gap-1">
                              <XCircle className="w-2.5 h-2.5" />Inactive
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-white/40">
                        {prof && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {prof.name}
                          </span>
                        )}
                        {!block.staff_id && (
                          <span className="text-white/25 italic">All staff</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {block.slot_duration_minutes}min slots
                        </span>
                        {(block.buffer_before_minutes > 0 || block.buffer_after_minutes > 0) && (
                          <span>
                            Buffer {block.buffer_before_minutes}/{block.buffer_after_minutes}m
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggle(block)}
                        title={block.is_active ? 'Deactivate' : 'Activate'}
                        className="h-7 w-7 rounded-lg hover:bg-graphite-700 flex items-center justify-center transition-colors"
                      >
                        {block.is_active
                          ? <ToggleRight className="w-4 h-4 text-gold-400" />
                          : <ToggleLeft  className="w-4 h-4 text-white/30" />
                        }
                      </button>
                      <button
                        onClick={() => openEdit(block)}
                        title="Edit"
                        className="h-7 w-7 rounded-lg hover:bg-graphite-700 flex items-center justify-center transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5 text-white/40 hover:text-white" />
                      </button>
                      <button
                        onClick={() => handleDelete(block)}
                        title="Delete"
                        className="h-7 w-7 rounded-lg hover:bg-red-400/10 flex items-center justify-center transition-colors"
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

      {/* Create/edit form modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeForm}
              className="absolute inset-0 bg-graphite-950/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{    opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative w-full max-w-xl bg-graphite-800 border border-surface-border rounded-2xl shadow-panel-lg overflow-hidden max-h-[90vh] flex flex-col"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gold-gradient opacity-60" />

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border shrink-0">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-gold-400" />
                  {editing ? 'Edit Availability Block' : 'New Availability Block'}
                </h2>
                <button onClick={closeForm} className="h-8 w-8 rounded-lg bg-graphite-700 hover:bg-graphite-600 flex items-center justify-center transition-colors">
                  <XCircle className="w-4 h-4 text-white/60" />
                </button>
              </div>

              {/* Body */}
              <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
                {error && (
                  <div className="rounded-lg bg-red-400/10 border border-red-400/20 px-3 py-2 text-xs text-red-400">
                    {error}
                  </div>
                )}

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
                      <option key={p.id} value={p.id}>{p.name}{!p.is_active ? ' (inactive)' : ''}</option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Block Name / Title (optional)</label>
                  <input
                    type="text"
                    value={form.title}
                    onChange={(e) => setField('title', e.target.value)}
                    placeholder="e.g. Morning shift, Weekday availability…"
                    className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors"
                  />
                </div>

                {/* Block type */}
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Block Type</label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setField('isRecurring', true)}
                      className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-xl border text-xs font-medium transition-all ${
                        form.isRecurring
                          ? 'bg-gold-gradient text-graphite-900 border-transparent shadow-glow-gold'
                          : 'border-surface-border text-white/50 hover:text-white'
                      }`}
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      Recurring Weekly
                    </button>
                    <button
                      type="button"
                      onClick={() => setField('isRecurring', false)}
                      className={`flex-1 flex items-center justify-center gap-2 h-9 rounded-xl border text-xs font-medium transition-all ${
                        !form.isRecurring
                          ? 'bg-gold-gradient text-graphite-900 border-transparent shadow-glow-gold'
                          : 'border-surface-border text-white/50 hover:text-white'
                      }`}
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      One-time
                    </button>
                  </div>
                </div>

                {/* Recurring fields */}
                {form.isRecurring && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Day of Week</label>
                      <div className="grid grid-cols-7 gap-1">
                        {DAY_NAMES.map((day, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setField('dayOfWeek', i)}
                            className={`h-9 rounded-xl text-xs font-medium transition-all ${
                              form.dayOfWeek === i
                                ? 'bg-gold-gradient text-graphite-900'
                                : 'bg-graphite-700 border border-surface-border text-white/50 hover:text-white'
                            }`}
                          >
                            {day.slice(0, 2)}
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
                  </>
                )}

                {/* One-time fields */}
                {!form.isRecurring && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Starts At</label>
                      <input
                        type="datetime-local"
                        value={form.startsAt}
                        onChange={(e) => setField('startsAt', e.target.value)}
                        style={{ colorScheme: 'dark' }}
                        className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-white/50 mb-1.5">Ends At</label>
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

                {/* Timezone */}
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

                {/* Slot settings */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">
                      <Clock className="inline w-3 h-3 mr-1" />Slot Duration (min)
                    </label>
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={form.slotDurationMinutes}
                      onChange={(e) => setField('slotDurationMinutes', parseInt(e.target.value) || 30)}
                      className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Max Bookings/Slot</label>
                    <input
                      type="number"
                      min={1}
                      max={50}
                      value={form.maxBookingsPerSlot}
                      onChange={(e) => setField('maxBookingsPerSlot', parseInt(e.target.value) || 1)}
                      className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Buffer */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Buffer Before (min)</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      step={5}
                      value={form.bufferBeforeMinutes}
                      onChange={(e) => setField('bufferBeforeMinutes', parseInt(e.target.value) || 0)}
                      className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Buffer After (min)</label>
                    <input
                      type="number"
                      min={0}
                      max={120}
                      step={5}
                      value={form.bufferAfterMinutes}
                      onChange={(e) => setField('bufferAfterMinutes', parseInt(e.target.value) || 0)}
                      className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs font-medium text-white/50">Block is Active</span>
                  <button
                    type="button"
                    onClick={() => setField('isActive', !form.isActive)}
                    className="flex items-center gap-2 text-sm"
                  >
                    {form.isActive ? (
                      <><ToggleRight className="w-5 h-5 text-gold-400" /><span className="text-gold-400 text-xs font-medium">Active</span></>
                    ) : (
                      <><ToggleLeft className="w-5 h-5 text-white/30" /><span className="text-white/30 text-xs">Inactive</span></>
                    )}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-surface-border flex gap-3 justify-end shrink-0">
                <button
                  onClick={closeForm}
                  className="h-9 px-4 rounded-xl bg-graphite-700 text-white/60 text-sm hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 h-9 px-5 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
                >
                  {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving…</> : <><CheckCircle2 className="w-3.5 h-3.5" />{editing ? 'Update' : 'Create'}</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
