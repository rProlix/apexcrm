// components/appointments/WeekView.tsx
'use client'

import { motion } from 'framer-motion'
import { AppointmentCard } from './AppointmentCard'
import type { Appointment } from '@/lib/appointments/types'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const HOUR_H = 56  // px per hour

function getWeekDays(anchor: Date): Date[] {
  const start = new Date(anchor)
  start.setDate(anchor.getDate() - anchor.getDay())  // Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10)
}

function getTopPercent(iso: string) {
  const d = new Date(iso)
  return (d.getUTCHours() + d.getUTCMinutes() / 60) * HOUR_H
}

function getHeightPercent(starts: string, ends: string) {
  const mins = (new Date(ends).getTime() - new Date(starts).getTime()) / 60_000
  return (mins / 60) * HOUR_H
}

function fmtHour(h: number) {
  if (h === 0)  return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function fmtDay(d: Date) {
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

interface Props {
  anchor:       Date
  appointments: Appointment[]
  onSelect:     (appt: Appointment) => void
}

export function WeekView({ anchor, appointments, onSelect }: Props) {
  const days  = getWeekDays(anchor)
  const today = new Date().toISOString().slice(0, 10)
  const now   = new Date()
  const nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_H

  const byDay: Record<string, Appointment[]> = {}
  days.forEach((d) => (byDay[dateKey(d)] = []))
  appointments.forEach((a) => {
    const k = a.starts_at.slice(0, 10)
    if (byDay[k]) byDay[k].push(a)
  })

  return (
    <div className="flex overflow-auto">
      {/* Hour axis */}
      <div className="shrink-0 w-14 pt-8 border-r border-surface-border/50">
        {HOURS.map((h) => (
          <div
            key={h}
            style={{ height: HOUR_H }}
            className="flex items-start justify-end pr-2 pt-0.5"
          >
            <span className="text-2xs text-white/25 tabular-nums">{fmtHour(h)}</span>
          </div>
        ))}
      </div>

      {/* Day columns */}
      <div className="flex flex-1 min-w-0">
        {days.map((day) => {
          const key     = dateKey(day)
          const isToday = key === today
          const dayAppts = byDay[key] ?? []

          return (
            <div key={key} className="flex-1 min-w-0 border-r border-surface-border/30 last:border-r-0">
              {/* Header */}
              <div className={`
                sticky top-0 z-10 h-8 flex items-center justify-center border-b border-surface-border/50
                ${isToday ? 'bg-gold-400/8' : 'bg-graphite-900/80 backdrop-blur-sm'}
              `}>
                <span className={`text-xs font-medium ${isToday ? 'text-gold-400' : 'text-white/40'}`}>
                  {fmtDay(day)}
                </span>
              </div>

              {/* Time grid */}
              <div className="relative" style={{ height: 24 * HOUR_H }}>
                {/* Hour lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ top: h * HOUR_H }}
                    className="absolute inset-x-0 border-t border-surface-border/20"
                  />
                ))}

                {/* Now line */}
                {isToday && (
                  <div
                    style={{ top: nowTop }}
                    className="absolute inset-x-0 z-10 flex items-center"
                  >
                    <div className="h-2 w-2 rounded-full bg-gold-400 -ml-1 shrink-0" />
                    <div className="flex-1 h-px bg-gold-400 opacity-60" />
                  </div>
                )}

                {/* Appointments */}
                {dayAppts.map((appt) => {
                  const top    = getTopPercent(appt.starts_at)
                  const height = Math.max(getHeightPercent(appt.starts_at, appt.ends_at), 24)

                  return (
                    <motion.div
                      key={appt.id}
                      initial={{ opacity: 0, x: -4 }}
                      animate={{ opacity: 1, x: 0 }}
                      style={{ top, height, minHeight: 24 }}
                      className="absolute inset-x-1 z-20 overflow-hidden"
                    >
                      <AppointmentCard
                        appointment={appt}
                        compact={height < 48}
                        onClick={onSelect}
                      />
                    </motion.div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
