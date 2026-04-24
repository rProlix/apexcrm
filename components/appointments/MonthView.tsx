// components/appointments/MonthView.tsx
'use client'

import { motion } from 'framer-motion'
import { AppointmentCard } from './AppointmentCard'
import type { Appointment } from '@/lib/appointments/types'

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface Props {
  year:         number
  month:        number  // 0-indexed
  appointments: Appointment[]
  onSelect:     (appt: Appointment) => void
  onDayClick?:  (date: string) => void
}

export function MonthView({ year, month, appointments, onSelect, onDayClick }: Props) {
  const today       = new Date()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay    = getFirstDayOfMonth(year, month)

  // Map date → appointments
  const byDate: Record<string, Appointment[]> = {}
  appointments.forEach((a) => {
    const key = a.starts_at.slice(0, 10)
    if (!byDate[key]) byDate[key] = []
    byDate[key].push(a)
  })

  // Build grid cells: prefix empty + days
  const cells: Array<{ day: number | null; dateKey: string }> = []
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateKey: '' })
  for (let d = 1; d <= daysInMonth; d++) {
    const mm  = String(month + 1).padStart(2, '0')
    const dd  = String(d).padStart(2, '0')
    cells.push({ day: d, dateKey: `${year}-${mm}-${dd}` })
  }
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push({ day: null, dateKey: '' })

  return (
    <div className="select-none">
      {/* Day labels */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-white/30 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Weeks */}
      <div className="grid grid-cols-7 border-l border-t border-surface-border/50">
        {cells.map((cell, idx) => {
          const isToday = cell.day !== null &&
            today.getFullYear() === year &&
            today.getMonth()    === month &&
            today.getDate()     === cell.day

          const appts  = cell.dateKey ? (byDate[cell.dateKey] ?? []) : []
          const hasMore = appts.length > 3

          return (
            <motion.div
              key={idx}
              initial={false}
              whileHover={cell.day ? { backgroundColor: 'rgba(201,168,76,0.04)' } : {}}
              onClick={() => cell.dateKey && onDayClick?.(cell.dateKey)}
              className={`
                border-r border-b border-surface-border/50 min-h-[100px] p-1.5 transition-colors
                ${cell.day ? 'cursor-pointer' : 'bg-graphite-900/30'}
              `}
            >
              {cell.day && (
                <>
                  {/* Date number */}
                  <div className={`
                    inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold mb-1
                    ${isToday
                      ? 'bg-gold-gradient text-graphite-900 shadow-glow-gold'
                      : 'text-white/60 hover:text-white'
                    }
                  `}>
                    {cell.day}
                  </div>

                  {/* Appointments */}
                  <div className="space-y-0.5">
                    {appts.slice(0, 3).map((a) => (
                      <AppointmentCard
                        key={a.id}
                        appointment={a}
                        compact
                        onClick={() => onSelect(a)}
                      />
                    ))}
                    {hasMore && (
                      <p className="text-2xs text-white/30 pl-1 pt-0.5">
                        +{appts.length - 3} more
                      </p>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
