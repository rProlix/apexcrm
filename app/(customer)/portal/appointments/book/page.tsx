'use client'

export const dynamic = 'force-dynamic'

// app/(customer)/portal/appointments/book/page.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, Clock, CheckCircle2, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { TimeSlotPicker } from '@/components/appointments/TimeSlotPicker'
import type { TimeSlot } from '@/lib/appointments/types'

type Step = 1 | 2 | 3

function fmtDate(d: Date) {
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const DURATIONS = [30, 60, 90, 120]

export default function BookAppointmentPage() {
  const router = useRouter()

  const [step,         setStep]         = useState<Step>(1)
  const [title,        setTitle]        = useState('')
  const [description]  = useState('')
  const [duration,     setDuration]     = useState(60)
  const [notes,        setNotes]        = useState('')
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null)
  const [submitting,   setSubmitting]   = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  // Calendar month state
  const today = new Date()
  const [calYear,  setCalYear]  = useState(today.getFullYear())
  const [calMonth, setCalMonth] = useState(today.getMonth())

  // Build calendar grid
  const daysInMonth  = new Date(calYear, calMonth + 1, 0).getDate()
  const firstDayOfWk = new Date(calYear, calMonth, 1).getDay()
  const cells: Array<{ day: number | null; dateKey: string }> = []
  for (let i = 0; i < firstDayOfWk; i++) cells.push({ day: null, dateKey: '' })
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(calMonth + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    cells.push({ day: d, dateKey: `${calYear}-${mm}-${dd}` })
  }

  const MONTHS     = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const DAY_LABELS = ['Su','Mo','Tu','We','Th','Fr','Sa']

  function prevMonth() {
    if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1) }
    else setCalMonth((m) => m - 1)
  }
  function nextMonth() {
    if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1) }
    else setCalMonth((m) => m + 1)
  }

  async function submit() {
    if (!selectedSlot || !title.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/appointments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:       title.trim(),
          description: description || null,
          starts_at:   selectedSlot.start,
          ends_at:     selectedSlot.end,
          notes:       notes || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Booking failed')
      router.push(`/portal/appointments/${data.appointment.id}?booked=1`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Booking failed')
      setSubmitting(false)
    }
  }

  const stepLabels: Record<Step, string> = {
    1: 'Select Date',
    2: 'Choose Time',
    3: 'Confirm',
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <button
          onClick={() => router.push('/portal/appointments')}
          className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-4"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
          Back to appointments
        </button>
        <h1 className="text-xl font-bold text-white">Book an Appointment</h1>
        <p className="text-sm text-white/40 mt-1">
          {step === 1 ? 'Choose your preferred date'
           : step === 2 ? 'Select an available time slot'
           : 'Review and confirm your booking'}
        </p>
      </motion.div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`
              h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
              ${step === s ? 'bg-gold-gradient text-graphite-900 shadow-glow-gold'
                : step > s  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-graphite-700 text-white/30 border border-surface-border'}
            `}>
              {step > s ? <CheckCircle2 className="w-3.5 h-3.5" /> : s}
            </div>
            <span className={`text-xs font-medium hidden sm:block ${step === s ? 'text-white' : 'text-white/30'}`}>
              {stepLabels[s]}
            </span>
            {s < 3 && <ChevronRight className="w-3.5 h-3.5 text-white/20" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        {/* ── Step 1: service info + date ── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{    opacity: 0, x: -20 }}
            className="space-y-4"
          >
            {/* Service info */}
            <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5 space-y-3">
              <h2 className="text-sm font-semibold text-white">Appointment Details</h2>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  What's this appointment for? *
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Haircut, Consultation, Service…"
                  className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Duration</label>
                <div className="flex gap-2">
                  {DURATIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDuration(m)}
                      className={`flex-1 h-9 rounded-xl text-sm font-medium transition-all ${
                        duration === m
                          ? 'bg-gold-gradient text-graphite-900 shadow-glow-gold'
                          : 'bg-graphite-700 border border-surface-border text-white/60 hover:border-gold-500/30'
                      }`}
                    >
                      {m < 60 ? `${m}m` : `${m / 60}h`}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Notes (optional)</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special requests or information…"
                  rows={2}
                  className="w-full px-3 py-2.5 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors resize-none"
                />
              </div>
            </div>

            {/* Calendar picker */}
            <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={prevMonth}
                  className="h-8 w-8 rounded-xl bg-graphite-700 border border-surface-border flex items-center justify-center hover:border-gold-500/30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-white/60" />
                </button>
                <h2 className="text-sm font-semibold text-white">{MONTHS[calMonth]} {calYear}</h2>
                <button
                  onClick={nextMonth}
                  className="h-8 w-8 rounded-xl bg-graphite-700 border border-surface-border flex items-center justify-center hover:border-gold-500/30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-white/60" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAY_LABELS.map((d) => (
                  <div key={d} className="text-center text-2xs font-medium text-white/30 py-1">{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {cells.map((cell, i) => {
                  const todayStr   = today.toISOString().slice(0, 10)
                  const isToday    = cell.dateKey === todayStr
                  const isPast     = cell.dateKey ? cell.dateKey < todayStr : false
                  const isSelected = cell.dateKey === selectedDate

                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={!cell.day || isPast}
                      onClick={() => { setSelectedDate(cell.dateKey); setSelectedSlot(null) }}
                      className={`
                        aspect-square rounded-lg text-xs font-medium transition-all
                        ${!cell.day       ? 'invisible' : ''}
                        ${isPast          ? 'text-white/15 cursor-not-allowed' : ''}
                        ${isSelected      ? 'bg-gold-gradient text-graphite-900 shadow-glow-gold' : ''}
                        ${isToday && !isSelected ? 'border border-gold-500/40 text-gold-400' : ''}
                        ${!isSelected && !isToday && !isPast ? 'text-white/70 hover:bg-graphite-700 hover:text-white' : ''}
                      `}
                    >
                      {cell.day}
                    </button>
                  )
                })}
              </div>
            </div>

            <button
              onClick={() => setStep(2)}
              disabled={!selectedDate || !title.trim()}
              className="w-full h-11 rounded-xl bg-gold-gradient text-graphite-900 font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue → Choose Time
            </button>
          </motion.div>
        )}

        {/* ── Step 2: time slot ── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{    opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5">
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays className="w-4 h-4 text-gold-400" />
                <span className="text-sm font-semibold text-white">
                  {fmtDate(new Date(selectedDate + 'T12:00:00Z'))}
                </span>
              </div>
              <TimeSlotPicker
                date={selectedDate}
                duration_minutes={duration}
                selected={selectedSlot?.start ?? null}
                onSelect={(slot) => setSelectedSlot(slot)}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex-1 h-11 rounded-xl border border-surface-border text-white/60 hover:text-white text-sm font-medium transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!selectedSlot}
                className="flex-1 h-11 rounded-xl bg-gold-gradient text-graphite-900 font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Continue → Confirm
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 3: confirm ── */}
        {step === 3 && selectedSlot && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{    opacity: 0, x: -20 }}
            className="space-y-4"
          >
            <div className="rounded-2xl border border-gold-500/20 bg-gold-400/5 p-6 space-y-4">
              <h2 className="text-sm font-semibold text-white">Booking Summary</h2>

              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-xl bg-gold-400/10 flex items-center justify-center shrink-0">
                    <CalendarDays className="w-4 h-4 text-gold-400" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Service</p>
                    <p className="text-sm font-medium text-white">{title}</p>
                    {description && <p className="text-xs text-white/40 mt-0.5">{description}</p>}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-xl bg-gold-400/10 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-gold-400" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40">Date &amp; Time</p>
                    <p className="text-sm font-medium text-white">
                      {fmtDate(new Date(selectedSlot.start))}
                    </p>
                    <p className="text-xs text-white/60">
                      {fmtTime(selectedSlot.start)} – {fmtTime(selectedSlot.end)}
                    </p>
                  </div>
                </div>

                {notes && (
                  <div className="rounded-xl bg-graphite-700/50 px-3 py-2.5">
                    <p className="text-xs text-white/40 mb-0.5">Notes</p>
                    <p className="text-xs text-white/70">{notes}</p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                disabled={submitting}
                className="flex-1 h-11 rounded-xl border border-surface-border text-white/60 hover:text-white text-sm font-medium transition-colors disabled:opacity-40"
              >
                ← Back
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-1 h-11 rounded-xl bg-gold-gradient text-graphite-900 font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-40 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Confirm Booking</>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
