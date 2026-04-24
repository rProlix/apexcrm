// components/appointments/DayView.tsx
'use client'

import { motion } from 'framer-motion'
import { AppointmentCard } from './AppointmentCard'
import type { Appointment } from '@/lib/appointments/types'

const HOURS  = Array.from({ length: 24 }, (_, i) => i)
const HOUR_H = 72  // px per hour — more spacious in single-day view

function getTop(iso: string) {
  const d = new Date(iso)
  return (d.getUTCHours() + d.getUTCMinutes() / 60) * HOUR_H
}
function getHeight(starts: string, ends: string) {
  const mins = (new Date(ends).getTime() - new Date(starts).getTime()) / 60_000
  return Math.max((mins / 60) * HOUR_H, 32)
}
function fmtHour(h: number) {
  if (h === 0)  return '12 AM'
  if (h === 12) return '12 PM'
  return h < 12 ? `${h}:00 AM` : `${h - 12}:00 PM`
}

interface Props {
  date:         Date
  appointments: Appointment[]
  onSelect:     (appt: Appointment) => void
  onHourClick?: (iso: string) => void
}

export function DayView({ date, appointments, onSelect, onHourClick }: Props) {
  const isToday = date.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)
  const now     = new Date()
  const nowTop  = (now.getHours() + now.getMinutes() / 60) * HOUR_H

  const dayAppts = appointments.filter(
    (a) => a.starts_at.slice(0, 10) === date.toISOString().slice(0, 10)
  )

  return (
    <div className="flex overflow-auto">
      {/* Hour axis */}
      <div className="shrink-0 w-16 border-r border-surface-border/50">
        {HOURS.map((h) => (
          <div
            key={h}
            style={{ height: HOUR_H }}
            className="flex items-start justify-end pr-3 pt-1"
          >
            <span className="text-xs text-white/25 tabular-nums whitespace-nowrap">{fmtHour(h)}</span>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <div className="flex-1 relative" style={{ height: 24 * HOUR_H }}>
        {/* Hour lines + click zones */}
        {HOURS.map((h) => {
          const isoStr = (() => {
            const d = new Date(date)
            d.setUTCHours(h, 0, 0, 0)
            return d.toISOString()
          })()

          return (
            <div
              key={h}
              style={{ top: h * HOUR_H, height: HOUR_H }}
              onClick={() => onHourClick?.(isoStr)}
              className="absolute inset-x-0 border-t border-surface-border/20 hover:bg-gold-400/3 cursor-pointer transition-colors"
            />
          )
        })}

        {/* Half-hour guides */}
        {HOURS.map((h) => (
          <div
            key={`h-${h}`}
            style={{ top: h * HOUR_H + HOUR_H / 2 }}
            className="absolute inset-x-0 border-t border-surface-border/10 pointer-events-none"
          />
        ))}

        {/* Now indicator */}
        {isToday && (
          <div
            style={{ top: nowTop }}
            className="absolute inset-x-0 z-10 flex items-center pointer-events-none"
          >
            <div className="h-2.5 w-2.5 rounded-full bg-gold-400 -ml-1 shrink-0 shadow-glow-gold" />
            <div className="flex-1 h-px bg-gold-400 opacity-70" />
          </div>
        )}

        {/* Appointments */}
        {dayAppts.map((appt) => {
          const top    = getTop(appt.starts_at)
          const height = getHeight(appt.starts_at, appt.ends_at)

          return (
            <motion.div
              key={appt.id}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1   }}
              style={{ top, height }}
              className="absolute left-2 right-2 z-20"
            >
              <AppointmentCard
                appointment={appt}
                compact={height < 60}
                onClick={onSelect}
              />
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
