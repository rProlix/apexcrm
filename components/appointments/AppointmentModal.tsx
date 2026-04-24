// components/appointments/AppointmentModal.tsx
'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CalendarDays, Clock, MapPin, FileText, Save, Trash2, CheckCircle } from 'lucide-react'
import { CustomerSelector } from './CustomerSelector'
import { TimeSlotPicker } from './TimeSlotPicker'
import { StatusBadge } from './StatusBadge'
import type { Appointment, AppointmentStatus, TimeSlot } from '@/lib/appointments/types'

interface Props {
  open:          boolean
  appointment?:  Appointment | null
  defaultStart?: string        // ISO string to pre-fill date + start time for new appointments
  isAdmin?:      boolean
  onClose:       () => void
  onSave:        (data: Partial<Appointment> & { customer_id?: string }) => Promise<void>
  onDelete?:     (appt: Appointment) => Promise<void>
  onConfirm?:    (appt: Appointment) => Promise<void>
  onComplete?:   (appt: Appointment) => Promise<void>
}

function toDateInput(iso?: string | null) {
  if (!iso) return ''
  return iso.slice(0, 10)
}
function toTimeInput(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(11, 16)
}
function buildISO(date: string, time: string) {
  if (!date || !time) return ''
  return `${date}T${time}:00.000Z`
}

export function AppointmentModal({
  open,
  appointment,
  defaultStart,
  isAdmin,
  onClose,
  onSave,
  onDelete,
  onConfirm,
  onComplete,
}: Props) {
  const isEdit = !!appointment

  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [customerId,  setCustomerId]  = useState<string | null>(null)
  const [date,        setDate]        = useState('')
  const [startTime,   setStartTime]   = useState('')
  const [endTime,     setEndTime]     = useState('')
  const [location,    setLocation]    = useState('')
  const [notes,       setNotes]       = useState('')
  const [showSlots,   setShowSlots]   = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  // Populate form when editing or pre-fill from a calendar click
  useEffect(() => {
    if (appointment) {
      setTitle(appointment.title ?? '')
      setDescription(appointment.description ?? '')
      setCustomerId(appointment.customer_id ?? null)
      setDate(toDateInput(appointment.starts_at))
      setStartTime(toTimeInput(appointment.starts_at))
      setEndTime(toTimeInput(appointment.ends_at))
      setLocation(appointment.location ?? '')
      setNotes(appointment.notes ?? '')
      setShowSlots(false)
    } else if (defaultStart) {
      // Pre-fill date + time from calendar cell click
      setTitle(''); setDescription(''); setCustomerId(null)
      setLocation(''); setNotes('')
      setDate(toDateInput(defaultStart))
      setStartTime(toTimeInput(defaultStart))
      // Default end time = start + 1 hour
      const endISO = new Date(new Date(defaultStart).getTime() + 60 * 60 * 1000).toISOString()
      setEndTime(toTimeInput(endISO))
      setShowSlots(true)
    } else {
      setTitle(''); setDescription(''); setCustomerId(null)
      setDate(''); setStartTime(''); setEndTime('')
      setLocation(''); setNotes('')
      setShowSlots(false)
    }
    setError(null)
  }, [appointment, open, defaultStart])

  function handleSlotSelect(slot: TimeSlot) {
    setStartTime(toTimeInput(slot.start))
    setEndTime(toTimeInput(slot.end))
    setShowSlots(false)
  }

  async function handleSave() {
    if (!title.trim()) { setError('Title is required'); return }
    if (!date)         { setError('Date is required');  return }
    if (!startTime || !endTime) { setError('Start and end time are required'); return }

    setError(null)
    setSaving(true)
    try {
      await onSave({
        title:       title.trim(),
        description: description || null,
        customer_id: customerId ?? undefined,
        starts_at:   buildISO(date, startTime),
        ends_at:     buildISO(date, endTime),
        location:    location || null,
        notes:       notes    || null,
      })
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!appointment || !onDelete) return
    setDeleting(true)
    try {
      await onDelete(appointment)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-graphite-950/80 backdrop-blur-sm"
          />

          {/* Panel */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className="relative w-full max-w-lg bg-graphite-800 border border-surface-border rounded-2xl shadow-panel-lg overflow-hidden"
          >
            {/* Gold accent border */}
            <div className="absolute inset-x-0 top-0 h-px bg-gold-gradient opacity-60" />

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-xl bg-gold-400/10 flex items-center justify-center">
                  <CalendarDays className="w-4 h-4 text-gold-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">
                    {isEdit ? 'Edit Appointment' : 'New Appointment'}
                  </h2>
                  {isEdit && <StatusBadge status={appointment!.status} />}
                </div>
              </div>
              <button onClick={onClose} className="h-8 w-8 rounded-lg bg-graphite-700 hover:bg-graphite-600 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-white/60" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {error && (
                <div className="rounded-lg bg-red-400/10 border border-red-400/20 px-3 py-2 text-xs text-red-400">
                  {error}
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Haircut & Style"
                  className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors"
                />
              </div>

              {/* Customer selector (admin only, optional) */}
              {isAdmin && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-white/50">Customer</label>
                    <span className="text-xs text-white/25 italic">optional</span>
                  </div>
                  <CustomerSelector
                    value={customerId}
                    onChange={(id) => setCustomerId(id)}
                  />
                </div>
              )}

              {/* Date + Time */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">
                    <CalendarDays className="inline w-3 h-3 mr-1" />Date *
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => { setDate(e.target.value); setShowSlots(true) }}
                    style={{ colorScheme: 'dark' }}
                    className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">
                    <Clock className="inline w-3 h-3 mr-1" />Start *
                  </label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">
                    <Clock className="inline w-3 h-3 mr-1" />End *
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                  />
                </div>
              </div>

              {/* Time slot picker (when date is selected) */}
              {showSlots && date && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-xl border border-gold-500/20 bg-gold-400/5 p-3"
                >
                  <TimeSlotPicker
                    date={date}
                    selected={startTime ? buildISO(date, startTime) : null}
                    onSelect={handleSlotSelect}
                  />
                </motion.div>
              )}

              {/* Location */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  <MapPin className="inline w-3 h-3 mr-1" />Location
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Optional location or address"
                  className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional description or service details"
                  rows={2}
                  className="w-full px-3 py-2.5 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors resize-none"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  <FileText className="inline w-3 h-3 mr-1" />Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Internal notes or instructions"
                  rows={2}
                  className="w-full px-3 py-2.5 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-surface-border flex items-center justify-between gap-3">
              <div className="flex gap-2">
                {isEdit && appointment && isAdmin && onConfirm && appointment.status === 'pending' && (
                  <button
                    onClick={() => onConfirm(appointment)}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-gold-500/10 border border-gold-500/20 text-gold-400 text-xs font-medium hover:bg-gold-500/20 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />Confirm
                  </button>
                )}
                {isEdit && appointment && isAdmin && onComplete && appointment.status === 'confirmed' && (
                  <button
                    onClick={() => onComplete(appointment)}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium hover:bg-emerald-500/20 transition-colors"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />Complete
                  </button>
                )}
                {isEdit && onDelete && (
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deleting ? 'Canceling…' : 'Cancel'}
                  </button>
                )}
              </div>

              <div className="flex gap-2 ml-auto">
                <button
                  onClick={onClose}
                  className="h-9 px-4 rounded-xl bg-graphite-700 text-white/60 text-sm hover:text-white transition-colors"
                >
                  Close
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Saving…' : isEdit ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
