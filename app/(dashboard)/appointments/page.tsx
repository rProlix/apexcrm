'use client'

export const dynamic = 'force-dynamic'

// app/(dashboard)/appointments/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CalendarDays, List, Plus, TrendingUp, Clock, CheckCircle2,
} from 'lucide-react'
import { CalendarView }      from '@/components/appointments/CalendarView'
import { AppointmentList }   from '@/components/appointments/AppointmentList'
import { AppointmentModal }  from '@/components/appointments/AppointmentModal'
import type { Appointment }  from '@/lib/appointments/types'

type ViewTab = 'calendar' | 'list'

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number | string; icon: React.ElementType; color: string
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-surface-border bg-graphite-800/50 p-5 flex items-center gap-4"
    >
      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-white/40 mt-0.5">{label}</p>
      </div>
    </motion.div>
  )
}

export default function AppointmentsPage() {
  const [tab,          setTab]          = useState<ViewTab>('calendar')
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading,      setLoading]      = useState(true)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editing,      setEditing]      = useState<Appointment | null>(null)
  const [defaultStart, setDefaultStart] = useState<string | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/appointments?limit=500')
      const data = await res.json()
      setAppointments(data.appointments ?? [])
    } catch {
      setAppointments([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew(start?: string) {
    setEditing(null)
    setDefaultStart(start)
    setModalOpen(true)
  }
  function openEdit(appt: Appointment) {
    setEditing(appt)
    setDefaultStart(undefined)
    setModalOpen(true)
  }

  async function handleSave(data: Partial<Appointment> & { customer_id?: string }) {
    const url    = editing ? `/api/appointments/${editing.id}` : '/api/appointments'
    const method = editing ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Failed to save')
    await load()
  }

  async function handleDelete(appt: Appointment) {
    await fetch(`/api/appointments/${appt.id}`, { method: 'DELETE' })
    await load()
  }

  async function handleConfirm(appt: Appointment) {
    await fetch(`/api/appointments/${appt.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'confirmed' }),
    })
    await load()
    setModalOpen(false)
  }

  async function handleComplete(appt: Appointment) {
    await fetch(`/api/appointments/${appt.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: 'completed' }),
    })
    await load()
    setModalOpen(false)
  }

  const now      = new Date().toISOString()
  const upcoming = appointments.filter((a) => a.starts_at > now && a.status !== 'canceled')
  const pending  = appointments.filter((a) => a.status === 'pending')
  const done     = appointments.filter((a) => a.status === 'completed')

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Appointments</h1>
          <p className="text-sm text-white/40 mt-1">Manage and schedule customer appointments</p>
        </div>
        <button
          onClick={() => openNew()}
          className="flex items-center gap-2 h-10 px-5 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
        >
          <Plus className="w-4 h-4" />
          New Appointment
        </button>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total"     value={appointments.length} icon={CalendarDays}  color="bg-gold-400/10    text-gold-400"    />
        <StatCard label="Upcoming"  value={upcoming.length}     icon={TrendingUp}    color="bg-blue-400/10   text-blue-400"    />
        <StatCard label="Pending"   value={pending.length}      icon={Clock}         color="bg-amber-400/10  text-amber-400"   />
        <StatCard label="Completed" value={done.length}         icon={CheckCircle2}  color="bg-emerald-400/10 text-emerald-400" />
      </div>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-graphite-800 border border-surface-border rounded-xl p-1 w-fit">
        {([
          { id: 'calendar', label: 'Calendar', icon: CalendarDays },
          { id: 'list',     label: 'List',     icon: List         },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 h-8 px-4 rounded-lg text-sm font-medium transition-all ${
              tab === id
                ? 'bg-gold-gradient text-graphite-900 shadow-sm'
                : 'text-white/40 hover:text-white'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* View */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-center h-64"
          >
            <div className="flex items-center gap-3 text-white/30">
              <CalendarDays className="w-5 h-5 animate-pulse" />
              <span className="text-sm">Loading appointments…</span>
            </div>
          </motion.div>
        ) : tab === 'calendar' ? (
          <motion.div key="calendar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <CalendarView
              appointments={appointments}
              onSelect={openEdit}
              onNew={openNew}
              isAdmin
            />
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <AppointmentList
              appointments={appointments}
              onSelect={openEdit}
              onDelete={handleDelete}
              isAdmin
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <AppointmentModal
        open={modalOpen}
        appointment={editing}
        defaultStart={defaultStart}
        isAdmin
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        onDelete={handleDelete}
        onConfirm={handleConfirm}
        onComplete={handleComplete}
      />
    </div>
  )
}
