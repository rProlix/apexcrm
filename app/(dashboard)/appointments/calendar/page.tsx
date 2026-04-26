'use client'

export const dynamic = 'force-dynamic'

// app/(dashboard)/appointments/calendar/page.tsx

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { CalendarDays, Plus } from 'lucide-react'
import { CalendarView }      from '@/components/appointments/CalendarView'
import { AppointmentModal }  from '@/components/appointments/AppointmentModal'
import type { Appointment }  from '@/lib/appointments/types'

export default function AppointmentsCalendarPage() {
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
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openEdit(appt: Appointment) {
    setEditing(appt)
    setDefaultStart(undefined)
    setModalOpen(true)
  }
  function openNew(start?: string) {
    setEditing(null)
    setDefaultStart(start)
    setModalOpen(true)
  }

  async function handleSave(data: Partial<Appointment> & { customer_id?: string }) {
    const url    = editing ? `/api/appointments/${editing.id}` : '/api/appointments'
    const method = editing ? 'PATCH' : 'POST'
    const res    = await fetch(url, {
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

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gold-400/10 flex items-center justify-center">
            <CalendarDays className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Calendar View</h1>
            <p className="text-xs text-white/40">Full appointment calendar</p>
          </div>
        </div>
        <button
          onClick={() => openNew()}
          className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center h-80 rounded-2xl border border-surface-border bg-graphite-800/30">
          <div className="text-white/30 text-sm animate-pulse">Loading calendar…</div>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <CalendarView
            appointments={appointments}
            onSelect={openEdit}
            onNew={openNew}
            isAdmin
          />
        </motion.div>
      )}

      <AppointmentModal
        open={modalOpen}
        appointment={editing}
        defaultStart={defaultStart}
        isAdmin
        onClose={() => { setModalOpen(false); setEditing(null) }}
        onSave={handleSave}
        onDelete={handleDelete}
      />
    </div>
  )
}
