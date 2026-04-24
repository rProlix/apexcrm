// app/(dashboard)/appointments/list/page.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { List, Plus, Download } from 'lucide-react'
import { AppointmentList }  from '@/components/appointments/AppointmentList'
import { AppointmentModal } from '@/components/appointments/AppointmentModal'
import type { Appointment } from '@/lib/appointments/types'

export default function AppointmentsListPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading,      setLoading]      = useState(true)
  const [modalOpen,    setModalOpen]    = useState(false)
  const [editing,      setEditing]      = useState<Appointment | null>(null)

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

  function exportCSV() {
    const header = 'Title,Customer,Date,Start,End,Status,Location\n'
    const rows   = appointments.map((a) => [
      `"${a.title}"`,
      `"${a.customer?.name ?? ''}"`,
      `"${a.starts_at.slice(0, 10)}"`,
      `"${new Date(a.starts_at).toLocaleTimeString()}"`,
      `"${new Date(a.ends_at).toLocaleTimeString()}"`,
      `"${a.status}"`,
      `"${a.location ?? ''}"`,
    ].join(',')).join('\n')

    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `appointments-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
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
            <List className="w-5 h-5 text-gold-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">All Appointments</h1>
            <p className="text-xs text-white/40">
              {loading ? '…' : `${appointments.length} total`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            className="flex items-center gap-2 h-9 px-3 rounded-xl bg-graphite-700 border border-surface-border text-white/60 text-xs font-medium hover:text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
          <button
            onClick={() => { setEditing(null); setModalOpen(true) }}
            className="flex items-center gap-2 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow"
          >
            <Plus className="w-3.5 h-3.5" />
            New
          </button>
        </div>
      </motion.div>

      {loading ? (
        <div className="rounded-2xl border border-surface-border bg-graphite-800/30 h-64 flex items-center justify-center">
          <p className="text-white/30 text-sm animate-pulse">Loading…</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <AppointmentList
            appointments={appointments}
            onSelect={openEdit}
            onDelete={handleDelete}
            isAdmin
          />
        </motion.div>
      )}

      <AppointmentModal
        open={modalOpen}
        appointment={editing}
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
