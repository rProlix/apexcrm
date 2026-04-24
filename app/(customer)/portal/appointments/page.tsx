// app/(customer)/portal/appointments/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { CalendarDays, Plus, Clock, ChevronRight, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { StatusBadge } from '@/components/appointments/StatusBadge'
import type { Appointment } from '@/lib/appointments/types'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
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

const STATUS_ICONS: Record<string, React.ElementType> = {
  pending:   AlertCircle,
  confirmed: CheckCircle2,
  completed: CheckCircle2,
  canceled:  XCircle,
}

export default function CustomerAppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading,      setLoading]      = useState(true)
  const [tab,          setTab]          = useState<'upcoming' | 'past'>('upcoming')

  useEffect(() => {
    fetch('/api/appointments?limit=200')
      .then((r) => r.json())
      .then(({ appointments: data }) => setAppointments(data ?? []))
      .catch(() => setAppointments([]))
      .finally(() => setLoading(false))
  }, [])

  const now   = new Date().toISOString()
  const shown = appointments.filter((a) =>
    tab === 'upcoming'
      ? a.starts_at >= now && a.status !== 'canceled'
      : a.starts_at  < now || a.status === 'canceled'
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-xl font-bold text-white">My Appointments</h1>
          <p className="text-sm text-white/40 mt-0.5">Track and manage your bookings</p>
        </div>
        <Link
          href="/portal/appointments/book"
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
        >
          <Plus className="w-3.5 h-3.5" />
          Book
        </Link>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 bg-graphite-800 border border-surface-border rounded-xl p-1 w-fit">
        {(['upcoming', 'past'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-8 px-4 rounded-lg text-sm font-medium capitalize transition-all ${
              tab === t
                ? 'bg-gold-gradient text-graphite-900 shadow-sm'
                : 'text-white/40 hover:text-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <CalendarDays className="w-6 h-6 text-white/20 animate-pulse" />
        </div>
      ) : shown.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl border border-surface-border bg-graphite-800/30 px-8 py-16 text-center"
        >
          <CalendarDays className="w-10 h-10 text-white/10 mx-auto mb-4" />
          <p className="text-base font-medium text-white/40">
            {tab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments'}
          </p>
          {tab === 'upcoming' && (
            <Link
              href="/portal/appointments/book"
              className="mt-4 inline-flex items-center gap-2 h-9 px-5 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              Book your first appointment
            </Link>
          )}
        </motion.div>
      ) : (
        <AnimatePresence>
          <div className="space-y-3">
            {shown.map((appt, i) => {
              const Icon = STATUS_ICONS[appt.status] ?? CalendarDays
              return (
                <motion.div
                  key={appt.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Link
                    href={`/portal/appointments/${appt.id}`}
                    className="block rounded-2xl border border-surface-border bg-graphite-800/50 hover:border-gold-500/30 hover:bg-graphite-700/50 transition-all group"
                  >
                    <div className="p-5 flex items-center gap-4">
                      {/* Status icon */}
                      <div className={`
                        h-12 w-12 rounded-xl flex items-center justify-center shrink-0
                        ${appt.status === 'confirmed' ? 'bg-gold-400/10'
                          : appt.status === 'completed' ? 'bg-emerald-400/10'
                          : appt.status === 'canceled'  ? 'bg-red-400/10'
                          : 'bg-amber-400/10'}
                      `}>
                        <Icon className={`w-5 h-5 ${
                          appt.status === 'confirmed' ? 'text-gold-400'
                          : appt.status === 'completed' ? 'text-emerald-400'
                          : appt.status === 'canceled'  ? 'text-red-400'
                          : 'text-amber-400'
                        }`} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-white group-hover:text-gold-300 transition-colors">
                              {appt.title}
                            </h3>
                            <p className="text-xs text-white/40 mt-0.5">
                              {fmtDate(appt.starts_at)}
                            </p>
                          </div>
                          <StatusBadge status={appt.status} size="md" />
                        </div>

                        <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {fmtTime(appt.starts_at)} · {durationLabel(appt.starts_at, appt.ends_at)}
                          </span>
                          {appt.location && (
                            <span className="truncate">{appt.location}</span>
                          )}
                        </div>
                      </div>

                      <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-gold-400 transition-colors shrink-0" />
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </AnimatePresence>
      )}
    </div>
  )
}
