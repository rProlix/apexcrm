// components/appointments/CalendarView.tsx
'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react'
import { MonthView } from './MonthView'
import { WeekView }  from './WeekView'
import { DayView }   from './DayView'
import type { Appointment } from '@/lib/appointments/types'

type ViewMode = 'month' | 'week' | 'day'

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function headerLabel(mode: ViewMode, anchor: Date): string {
  if (mode === 'month') {
    return `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`
  }
  if (mode === 'week') {
    const start = new Date(anchor)
    start.setDate(anchor.getDate() - anchor.getDay())
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    const s = start.toLocaleDateString([], { month: 'short', day: 'numeric' })
    const e = end.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })
    return `${s} – ${e}`
  }
  return anchor.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function navigate(mode: ViewMode, anchor: Date, dir: 1 | -1): Date {
  const d = new Date(anchor)
  if (mode === 'month') d.setMonth(d.getMonth() + dir)
  if (mode === 'week')  d.setDate(d.getDate() + dir * 7)
  if (mode === 'day')   d.setDate(d.getDate() + dir)
  return d
}

interface Props {
  appointments: Appointment[]
  onSelect:     (appt: Appointment) => void
  onNew?:       (defaultStart?: string) => void
  isAdmin?:     boolean
}

export function CalendarView({ appointments, onSelect, onNew, isAdmin }: Props) {
  const [mode,   setMode]   = useState<ViewMode>('month')
  const [anchor, setAnchor] = useState(new Date())
  const [dir,    setDir]    = useState<1 | -1>(1)

  function go(d: 1 | -1) {
    setDir(d)
    setAnchor((prev) => navigate(mode, prev, d))
  }
  function goToday() {
    setAnchor(new Date())
  }

  return (
    <div className="rounded-2xl border border-surface-border bg-graphite-800/40 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-surface-border bg-graphite-800/60">
        {/* Nav */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => go(-1)}
            className="h-8 w-8 rounded-xl bg-graphite-700 border border-surface-border hover:border-gold-500/30 flex items-center justify-center transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-white/60" />
          </button>

          <button
            onClick={goToday}
            className="h-8 px-3 rounded-xl bg-graphite-700 border border-surface-border hover:border-gold-500/30 text-xs text-white/60 hover:text-gold-400 transition-colors font-medium"
          >
            Today
          </button>

          <button
            onClick={() => go(1)}
            className="h-8 w-8 rounded-xl bg-graphite-700 border border-surface-border hover:border-gold-500/30 flex items-center justify-center transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-white/60" />
          </button>

          <motion.h2
            key={anchor.toISOString() + mode}
            initial={{ opacity: 0, x: dir * 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm font-semibold text-white ml-2 min-w-[200px]"
          >
            {headerLabel(mode, anchor)}
          </motion.h2>
        </div>

        {/* View toggle + New */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-graphite-700 border border-surface-border p-0.5">
            {(['month', 'week', 'day'] as ViewMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 h-7 rounded-lg text-xs font-medium capitalize transition-all ${
                  mode === m
                    ? 'bg-gold-gradient text-graphite-900 shadow-sm'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {isAdmin && onNew && (
            <button
              onClick={() => onNew()}
              className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-gold-gradient text-graphite-900 text-xs font-semibold hover:shadow-glow-gold transition-shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}
        </div>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-auto min-h-[500px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={anchor.toISOString().slice(0, 7) + mode}
            initial={{ opacity: 0, x: dir * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{    opacity: 0, x: dir * -20 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {mode === 'month' && (
              <MonthView
                year={anchor.getFullYear()}
                month={anchor.getMonth()}
                appointments={appointments}
                onSelect={onSelect}
                onDayClick={(date) => {
                  setAnchor(new Date(date + 'T12:00:00Z'))
                  setMode('day')
                }}
              />
            )}
            {mode === 'week' && (
              <WeekView
                anchor={anchor}
                appointments={appointments}
                onSelect={onSelect}
              />
            )}
            {mode === 'day' && (
              <DayView
                date={anchor}
                appointments={appointments}
                onSelect={onSelect}
                onHourClick={(iso) => onNew?.(iso)}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
