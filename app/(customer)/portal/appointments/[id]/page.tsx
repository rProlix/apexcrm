'use client'

export const dynamic = 'force-dynamic'

// app/(customer)/portal/appointments/[id]/page.tsx

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  CalendarDays, MapPin, FileText, ChevronLeft,
  CheckCircle2, XCircle, AlertCircle, Loader2, RefreshCw, Pencil, User,
} from 'lucide-react'
import { StatusBadge }    from '@/components/appointments/StatusBadge'
import { TimeSlotPicker } from '@/components/appointments/TimeSlotPicker'
import type { Appointment, TimeSlot } from '@/lib/appointments/types'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
function durationLabel(starts: string, ends: string) {
  const mins = Math.round((new Date(ends).getTime() - new Date(starts).getTime()) / 60_000)
  if (mins < 60) return `${mins} min`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m ? `${h}h ${m}m` : `${h} hour${h !== 1 ? 's' : ''}`
}

export default function CustomerAppointmentDetailPage() {
  const { id }       = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const justBooked   = searchParams.get('booked') === '1'

  const [appt,         setAppt]         = useState<Appointment | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [rescheduling, setRescheduling] = useState(false)
  const [newDate,      setNewDate]      = useState('')
  const [newSlot,      setNewSlot]      = useState<TimeSlot | null>(null)
  const [saving,       setSaving]       = useState(false)
  const [canceling,    setCanceling]    = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/appointments/${id}`)
      .then((r) => r.json())
      .then(({ appointment }) => setAppt(appointment ?? null))
      .catch(() => setAppt(null))
      .finally(() => setLoading(false))
  }, [id])

  async function handleReschedule() {
    if (!newSlot) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/appointments/reschedule', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id, starts_at: newSlot.start, ends_at: newSlot.end }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setAppt(data.appointment)
      setRescheduling(false)
      setNewDate('')
      setNewSlot(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to reschedule')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel() {
    setCanceling(true)
    setError(null)
    try {
      const res = await fetch(`/api/appointments/${id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: 'canceled' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed')
      setAppt(data.appointment)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to cancel')
    } finally {
      setCanceling(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    )
  }

  if (!appt) {
    return (
      <div className="text-center py-16">
        <p className="text-white/40">Appointment not found.</p>
        <Link href="/portal/appointments" className="mt-4 inline-block text-gold-400 text-sm underline">
          Back to appointments
        </Link>
      </div>
    )
  }

  const canModify = appt.status !== 'completed' && appt.status !== 'canceled'
  const isPast    = new Date(appt.ends_at) < new Date()

  return (
    <div className="max-w-lg mx-auto space-y-5">
      {/* Back */}
      <Link href="/portal/appointments" className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors">
        <ChevronLeft className="w-3.5 h-3.5" />
        My Appointments
      </Link>

      {/* Success banner */}
      <AnimatePresence>
        {justBooked && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center gap-3"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-300">Appointment booked!</p>
              <p className="text-xs text-emerald-400/70 mt-0.5">We&apos;ll confirm your booking shortly.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-surface-border bg-graphite-800/50 overflow-hidden"
      >
        <div className="h-1 bg-gold-gradient opacity-70" />

        <div className="p-6 space-y-5">
          {/* Title + status */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-white">{appt.title}</h1>
              {appt.description && (
                <p className="text-sm text-white/50 mt-1">{appt.description}</p>
              )}
            </div>
            <StatusBadge status={appt.status} size="md" />
          </div>

          {/* Details */}
          <div className="space-y-3">
            {/* Professional */}
            {appt.professional && (
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-xl bg-gold-400/10 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-gold-400" />
                </div>
                <div>
                  <p className="text-xs text-white/40">Professional</p>
                  <p className="text-sm font-medium text-white">{appt.professional.name}</p>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <CalendarDays className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm text-white">{fmtDate(appt.starts_at)}</p>
                <p className="text-xs text-white/40">
                  {fmtTime(appt.starts_at)} – {fmtTime(appt.ends_at)} · {durationLabel(appt.starts_at, appt.ends_at)}
                </p>
              </div>
            </div>

            {appt.location && (
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" />
                <p className="text-sm text-white">{appt.location}</p>
              </div>
            )}

            {appt.notes && (
              <div className="flex items-start gap-3">
                <FileText className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" />
                <p className="text-sm text-white/70">{appt.notes}</p>
              </div>
            )}
          </div>

          {/* Status banners */}
          {appt.status === 'pending' && (
            <div className="flex items-center gap-2 rounded-xl bg-amber-400/8 border border-amber-400/20 px-3 py-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-amber-300">Awaiting confirmation from our team.</p>
            </div>
          )}
          {appt.status === 'confirmed' && (
            <div className="flex items-center gap-2 rounded-xl bg-gold-400/8 border border-gold-400/20 px-3 py-2.5">
              <CheckCircle2 className="w-4 h-4 text-gold-400 shrink-0" />
              <p className="text-xs text-gold-300">Your appointment is confirmed.</p>
            </div>
          )}
          {appt.status === 'canceled' && (
            <div className="flex items-center gap-2 rounded-xl bg-red-400/8 border border-red-400/20 px-3 py-2.5">
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-300">This appointment has been canceled.</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Actions */}
      {canModify && !isPast && (
        <div className="flex gap-3">
          {!rescheduling ? (
            <>
              <button
                onClick={() => setRescheduling(true)}
                className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-gold-500/30 text-gold-400 text-sm font-medium hover:bg-gold-400/8 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reschedule
              </button>
              <button
                onClick={handleCancel}
                disabled={canceling}
                className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-red-500/30 text-red-400 text-sm font-medium hover:bg-red-400/8 transition-colors disabled:opacity-50"
              >
                {canceling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                {canceling ? 'Canceling…' : 'Cancel'}
              </button>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 rounded-2xl border border-gold-500/20 bg-gold-400/5 p-4 space-y-3"
            >
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Pencil className="w-3.5 h-3.5 text-gold-400" />
                Reschedule Appointment
              </h3>

              {appt.professional && (
                <div className="flex items-center gap-2 text-xs text-white/50">
                  <User className="w-3 h-3" />
                  Rescheduling with <span className="text-white/70 font-medium ml-1">{appt.professional.name}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">New Date</label>
                <input
                  type="date"
                  value={newDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => { setNewDate(e.target.value); setNewSlot(null) }}
                  className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
                />
              </div>

              {newDate && (
                <TimeSlotPicker
                  date={newDate}
                  duration_minutes={Math.round(
                    (new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60_000
                  )}
                  staffId={appt.staff_id ?? undefined}
                  selected={newSlot?.start ?? null}
                  onSelect={(slot) => setNewSlot(slot)}
                />
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => { setRescheduling(false); setNewDate(''); setNewSlot(null) }}
                  className="flex-1 h-9 rounded-xl border border-surface-border text-white/50 text-sm hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReschedule}
                  disabled={!newSlot || saving}
                  className="flex-1 h-9 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold disabled:opacity-40 hover:shadow-glow-gold transition-shadow flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  {saving ? 'Saving…' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Book another */}
      <div className="text-center pt-2">
        <Link href="/portal/appointments/book" className="text-xs text-white/30 hover:text-gold-400 transition-colors">
          Book another appointment →
        </Link>
      </div>
    </div>
  )
}
