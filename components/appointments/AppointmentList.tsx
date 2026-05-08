// components/appointments/AppointmentList.tsx
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, ChevronRight, Search, SlidersHorizontal, User } from 'lucide-react'
import { useState, useMemo, useEffect } from 'react'
import { StatusBadge } from './StatusBadge'
import type { Appointment, Professional } from '@/lib/appointments/types'

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString([], {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface Props {
  appointments: Appointment[]
  onSelect?:    (appt: Appointment) => void
  onDelete?:    (appt: Appointment) => void
  isAdmin?:     boolean
}

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '',          label: 'All'       },
  { value: 'pending',   label: 'Pending'   },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled',  label: 'Canceled'  },
]

export function AppointmentList({ appointments, onSelect, isAdmin }: Props) {
  const [search,         setSearch]         = useState('')
  const [statusFilter,   setStatusFilter]   = useState('')
  const [staffFilter,    setStaffFilter]    = useState('')
  const [professionals,  setProfessionals]  = useState<Professional[]>([])

  useEffect(() => {
    if (!isAdmin) return
    fetch('/api/professionals?active=false')
      .then((r) => r.json())
      .then(({ data }) => setProfessionals(data?.professionals ?? []))
      .catch(() => setProfessionals([]))
  }, [isAdmin])

  const filtered = useMemo(() => {
    return appointments.filter((a) => {
      const matchesStatus    = !statusFilter || a.status === statusFilter
      const matchesStaff     = !staffFilter  || a.staff_id === staffFilter
      const q                = search.toLowerCase()
      const matchesSearch    = !q || (
        a.title.toLowerCase().includes(q) ||
        a.customer?.name?.toLowerCase().includes(q) ||
        a.professional?.name?.toLowerCase().includes(q) ||
        a.location?.toLowerCase().includes(q)
      )
      return matchesStatus && matchesStaff && matchesSearch
    })
  }, [appointments, search, statusFilter, staffFilter])

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text"
              placeholder="Search appointments…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 h-10 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-gold-500/50 transition-colors"
            />
          </div>

          {/* Professional filter */}
          {isAdmin && professionals.length > 0 && (
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-white/30 shrink-0" />
              <select
                value={staffFilter}
                onChange={(e) => setStaffFilter(e.target.value)}
                className="h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white focus:outline-none focus:border-gold-500/50 transition-colors"
              >
                <option value="">All professionals</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <SlidersHorizontal className="w-4 h-4 text-white/30 shrink-0" />
          <div className="flex gap-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 h-8 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === f.value
                    ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                    : 'bg-graphite-700 text-white/40 border border-surface-border hover:text-white/70'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table — hidden on mobile in favor of card list */}
      <div className="hidden md:block rounded-2xl border border-surface-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-graphite-800/60">
                <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Appointment</th>
                {isAdmin && (
                  <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Customer</th>
                )}
                {isAdmin && (
                  <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Professional</th>
                )}
                <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Date &amp; Time</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Status</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              <AnimatePresence initial={false}>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin ? 6 : 4} className="px-5 py-16 text-center">
                      <Calendar className="w-8 h-8 text-white/15 mx-auto mb-3" />
                      <p className="text-sm text-white/30">No appointments found</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((appt, i) => (
                    <motion.tr
                      key={appt.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onClick={() => onSelect?.(appt)}
                      className="border-b border-surface-border/50 bg-graphite-900/40 hover:bg-graphite-800/60 cursor-pointer transition-colors group"
                    >
                      <td className="px-5 py-4">
                        <p className="font-medium text-white leading-tight">{appt.title}</p>
                        {appt.location && (
                          <p className="text-xs text-white/35 mt-0.5 truncate max-w-[200px]">{appt.location}</p>
                        )}
                      </td>

                      {isAdmin && (
                        <td className="px-5 py-4">
                          {appt.customer ? (
                            <div>
                              <p className="text-white/80">{appt.customer.name}</p>
                              {appt.customer.email && (
                                <p className="text-xs text-white/35">{appt.customer.email}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-white/25 text-xs italic">No customer</span>
                          )}
                        </td>
                      )}

                      {isAdmin && (
                        <td className="px-5 py-4">
                          {appt.professional ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-gold-400/10 flex items-center justify-center shrink-0">
                                <span className="text-2xs font-bold text-gold-400">
                                  {appt.professional.name.charAt(0).toUpperCase()}
                                </span>
                              </div>
                              <span className="text-white/80 text-sm">{appt.professional.name}</span>
                            </div>
                          ) : (
                            <span className="text-white/25 text-xs italic">Unassigned</span>
                          )}
                        </td>
                      )}

                      <td className="px-5 py-4">
                        <p className="text-white/80">{fmtDate(appt.starts_at)}</p>
                        <p className="text-xs text-white/40">{fmtTime(appt.starts_at)} – {fmtTime(appt.ends_at)}</p>
                      </td>

                      <td className="px-5 py-4">
                        <StatusBadge status={appt.status} />
                      </td>

                      <td className="px-3 py-4">
                        <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-gold-400 transition-colors" />
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        <AnimatePresence initial={false}>
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-surface-border px-5 py-12 text-center">
              <Calendar className="w-8 h-8 text-white/15 mx-auto mb-3" />
              <p className="text-sm text-white/30">No appointments found</p>
            </div>
          ) : (
            filtered.map((appt, i) => (
              <motion.div
                key={appt.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => onSelect?.(appt)}
                className="rounded-xl border border-surface-border bg-graphite-800/40 p-4 space-y-2 cursor-pointer hover:border-gold-500/20 transition-colors active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-white text-sm leading-tight">{appt.title}</p>
                  <StatusBadge status={appt.status} />
                </div>

                <div className="text-xs text-white/50 space-y-1">
                  <p>{fmtDate(appt.starts_at)} · {fmtTime(appt.starts_at)} – {fmtTime(appt.ends_at)}</p>
                  {isAdmin && appt.customer && (
                    <p className="flex items-center gap-1">
                      <span className="text-white/30">Customer:</span> {appt.customer.name}
                    </p>
                  )}
                  {appt.professional && (
                    <p className="flex items-center gap-1">
                      <User className="w-3 h-3 text-white/30" />
                      {appt.professional.name}
                    </p>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {filtered.length > 0 && (
        <p className="text-xs text-white/25 text-right">
          {filtered.length} appointment{filtered.length !== 1 ? 's' : ''}
        </p>
      )}
    </div>
  )
}
