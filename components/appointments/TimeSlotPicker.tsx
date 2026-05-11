// components/appointments/TimeSlotPicker.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, RefreshCw, CalendarX, CheckCircle2 } from 'lucide-react'
import type { TimeSlot } from '@/lib/appointments/types'

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function groupByHour(slots: TimeSlot[]): Map<number, TimeSlot[]> {
  const groups = new Map<number, TimeSlot[]>()
  for (const slot of slots) {
    const h = new Date(slot.start).getUTCHours()
    const existing = groups.get(h) ?? []
    groups.set(h, [...existing, slot])
  }
  return groups
}

function fmtHourLabel(h: number) {
  if (h === 0)  return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

interface Props {
  date:              string
  duration_minutes?: number
  staffId?:          string
  selected?:         string | null
  onSelect:          (slot: TimeSlot) => void
  onBooked?:         () => void
}

// Normalise both AvailableSlot ({starts_at, ends_at}) and TimeSlot ({start, end}) shapes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normaliseSlot(s: any): TimeSlot {
  return {
    start:     s.starts_at ?? s.start,
    end:       s.ends_at   ?? s.end,
    available: s.available !== false,
  }
}

export function TimeSlotPicker({
  date,
  duration_minutes,
  staffId,
  selected,
  onSelect,
}: Props) {
  const [slots,    setSlots]    = useState<TimeSlot[]>([])
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [fetchKey, setFetchKey] = useState(0)

  const fetchSlots = useCallback(async () => {
    if (!date) return
    setLoading(true)
    setError(null)

    const params = new URLSearchParams({ date })
    if (duration_minutes) params.set('durationMinutes', String(duration_minutes))
    if (staffId)          params.set('staffId', staffId)

    // Use new available-slots endpoint (respects block_type including blackouts)
    // Fall back to legacy availability endpoint if new one fails
    const newUrl    = `/api/appointments/available-slots?${params.toString()}`
    const legacyUrl = `/api/appointments/availability?${params.toString()}`

    try {
      let res  = await fetch(newUrl, { cache: 'no-store' })
      let data = await res.json()

      // If new endpoint fails or returns no data, try legacy
      if (!res.ok || (!data.slots?.length && staffId)) {
        res  = await fetch(legacyUrl, { cache: 'no-store' })
        data = await res.json()
      }

      if (!res.ok && !data.ok) throw new Error(data.error ?? 'Failed to load slots')

      // Normalise both slot formats
      const rawSlots = data.slots ?? []
      setSlots(rawSlots.map(normaliseSlot).filter((s: TimeSlot) => s.available))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load available times')
      setSlots([])
    } finally {
      setLoading(false)
    }
  }, [date, duration_minutes, staffId, fetchKey])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSlots()
  }, [fetchSlots])

  function refresh() {
    setFetchKey((k) => k + 1)
  }

  const availableSlots = slots  // already filtered to available-only
  const hourGroups     = groupByHour(availableSlots)
  const sortedHours    = Array.from(hourGroups.keys()).sort((a, b) => a - b)

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/50 uppercase tracking-wider">
          Available Times
        </p>
        <div className="flex items-center gap-2">
          {availableSlots.length > 0 && (
            <span className="text-2xs text-white/25">
              {availableSlots.length} slot{availableSlots.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={refresh}
            disabled={loading}
            title="Refresh slots"
            className="h-6 w-6 rounded-lg hover:bg-graphite-700 flex items-center justify-center transition-colors"
          >
            <RefreshCw className={`w-3 h-3 text-white/30 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && !loading && (
        <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {loading && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="h-10 rounded-xl bg-graphite-700/40 animate-pulse"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
      )}

      {!loading && !error && availableSlots.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-xl border border-surface-border bg-graphite-800/40 px-4 py-10 text-center"
        >
          <CalendarX className="w-7 h-7 text-white/15 mx-auto mb-2" />
          <p className="text-sm text-white/30">No slots available</p>
          <p className="text-xs text-white/20 mt-1">
            {staffId
              ? 'No availability blocks found for this professional on this day'
              : 'This day is fully booked or outside working hours'}
          </p>
        </motion.div>
      )}

      <AnimatePresence mode="wait">
        {!loading && availableSlots.length > 0 && (
          <motion.div
            key={date + staffId + fetchKey}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{    opacity: 0 }}
            className="space-y-3"
          >
            {sortedHours.map((hour) => {
              const hourSlots = hourGroups.get(hour) ?? []
              return (
                <div key={hour}>
                  <p className="text-2xs text-white/25 font-medium mb-1.5 uppercase tracking-wider">
                    {fmtHourLabel(hour)}
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                    {hourSlots.map((slot, i) => {
                      const isSelected = selected === slot.start
                      const isPast     = new Date(slot.start) <= new Date()

                      return (
                        <motion.button
                          key={slot.start}
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.025 }}
                          type="button"
                          disabled={isPast}
                          onClick={() => !isPast && onSelect(slot)}
                          className={`
                            relative h-10 rounded-xl text-xs font-semibold transition-all duration-150 overflow-hidden
                            ${isPast
                              ? 'bg-graphite-800/30 text-white/20 cursor-not-allowed border border-surface-border/30'
                              : isSelected
                              ? 'bg-gold-gradient text-graphite-900 shadow-glow-gold ring-2 ring-gold-400/40'
                              : 'bg-graphite-700 border border-surface-border text-white/80 hover:border-gold-500/50 hover:text-gold-400 hover:bg-graphite-700/80 active:scale-95'
                            }
                          `}
                        >
                          {isSelected && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="absolute inset-0 flex items-center justify-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {fmtTime(slot.start)}
                            </motion.span>
                          )}
                          {!isSelected && fmtTime(slot.start)}
                        </motion.button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{    opacity: 0, y: 4 }}
            className="flex items-center gap-2 rounded-xl border border-gold-500/30 bg-gold-400/8 px-3 py-2.5"
          >
            <Clock className="w-3.5 h-3.5 text-gold-400 shrink-0" />
            <p className="text-xs text-gold-300">
              Selected: <span className="font-semibold">{fmtTime(selected)}</span>
              <span className="text-gold-400/60 ml-1">— tap another slot to change</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
