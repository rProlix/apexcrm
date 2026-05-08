// components/appointments/ProfessionalsManager.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Pencil, User, Trash2, ToggleLeft, ToggleRight, RefreshCw, CheckCircle2, XCircle } from 'lucide-react'
import type { Professional } from '@/lib/appointments/types'

interface ProfForm {
  name:      string
  email:     string
  phone:     string
  role:      string
  is_active: boolean
}

const EMPTY: ProfForm = { name: '', email: '', phone: '', role: 'staff', is_active: true }

export function ProfessionalsManager() {
  const [professionals, setProfessionals] = useState<Professional[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showForm,      setShowForm]      = useState(false)
  const [editing,       setEditing]       = useState<Professional | null>(null)
  const [form,          setForm]          = useState<ProfForm>(EMPTY)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/professionals?active=false')
      const data = await res.json()
      setProfessionals(data.data?.professionals ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function openNew() {
    setEditing(null); setForm(EMPTY); setError(null); setShowForm(true)
  }

  function openEdit(p: Professional) {
    setEditing(p)
    setForm({ name: p.name, email: p.email ?? '', phone: p.phone ?? '', role: p.role, is_active: p.is_active })
    setError(null)
    setShowForm(true)
  }

  function closeForm() { setShowForm(false); setEditing(null); setError(null) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setError(null); setSaving(true)
    try {
      const url    = editing ? `/api/professionals/${editing.id}` : '/api/professionals'
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, name: form.name.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to save')
      closeForm()
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(p: Professional) {
    await fetch(`/api/professionals/${p.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_active: !p.is_active }),
    })
    await load()
  }

  async function handleDelete(p: Professional) {
    if (!confirm(`Deactivate ${p.name}? They will no longer appear in booking flows.`)) return
    await fetch(`/api/professionals/${p.id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/40">
          {professionals.length} professional{professionals.length !== 1 ? 's' : ''}
        </p>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="h-9 w-9 flex items-center justify-center rounded-xl bg-graphite-700 border border-surface-border text-white/40 hover:text-white transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={openNew} className="flex items-center gap-1.5 h-9 px-4 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow">
            <Plus className="w-3.5 h-3.5" />
            Add Professional
          </button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-surface-border overflow-hidden">
        {loading ? (
          <div className="px-5 py-10 text-center text-white/30 text-sm animate-pulse">Loading…</div>
        ) : professionals.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <User className="w-8 h-8 text-white/10 mx-auto mb-2" />
            <p className="text-sm text-white/30">No professionals added yet</p>
            <p className="text-xs text-white/20 mt-1">Add staff members to assign availability blocks and appointments</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-border/40">
            <AnimatePresence initial={false}>
              {professionals.map((p) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center gap-3 px-5 py-3 hover:bg-graphite-700/20 transition-colors ${!p.is_active ? 'opacity-50' : ''}`}
                >
                  {/* Avatar */}
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatar_url} alt={p.name} className="w-9 h-9 rounded-full object-cover shrink-0" />
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-gold-400/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-gold-400">{p.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white truncate">{p.name}</p>
                      {p.is_active ? (
                        <span className="text-2xs px-1.5 py-0.5 rounded-full border border-emerald-500/30 text-emerald-400 bg-emerald-400/8 font-medium">Active</span>
                      ) : (
                        <span className="text-2xs px-1.5 py-0.5 rounded-full border border-surface-border text-white/25 font-medium">Inactive</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/40 mt-0.5">
                      <span className="capitalize">{p.role}</span>
                      {p.email && <span className="truncate">{p.email}</span>}
                      {p.phone && <span>{p.phone}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => handleToggle(p)} title={p.is_active ? 'Deactivate' : 'Activate'} className="h-7 w-7 rounded-lg hover:bg-graphite-700 flex items-center justify-center transition-colors">
                      {p.is_active ? <ToggleRight className="w-4 h-4 text-gold-400" /> : <ToggleLeft className="w-4 h-4 text-white/30" />}
                    </button>
                    <button onClick={() => openEdit(p)} title="Edit" className="h-7 w-7 rounded-lg hover:bg-graphite-700 flex items-center justify-center transition-colors">
                      <Pencil className="w-3.5 h-3.5 text-white/40 hover:text-white" />
                    </button>
                    <button onClick={() => handleDelete(p)} title="Deactivate" className="h-7 w-7 rounded-lg hover:bg-red-400/10 flex items-center justify-center transition-colors">
                      <Trash2 className="w-3.5 h-3.5 text-white/30 hover:text-red-400" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={closeForm} className="absolute inset-0 bg-graphite-950/80 backdrop-blur-sm" />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1,    y: 0  }}
              exit={{    opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28 }}
              className="relative w-full max-w-md bg-graphite-800 border border-surface-border rounded-2xl shadow-panel-lg overflow-hidden"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gold-gradient opacity-60" />
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <User className="w-4 h-4 text-gold-400" />
                  {editing ? 'Edit Professional' : 'New Professional'}
                </h2>
                <button onClick={closeForm} className="h-8 w-8 rounded-lg bg-graphite-700 hover:bg-graphite-600 flex items-center justify-center transition-colors">
                  <XCircle className="w-4 h-4 text-white/60" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {error && <div className="rounded-lg bg-red-400/10 border border-red-400/20 px-3 py-2 text-xs text-red-400">{error}</div>}

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Name *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
                    <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="email@example.com" className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-white/50 mb-1.5">Phone</label>
                    <input type="tel" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+1 (555) 000-0000" className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-white/50 mb-1.5">Role / Title</label>
                  <input type="text" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} placeholder="e.g. stylist, therapist, consultant" className="w-full h-10 px-3 bg-graphite-700 border border-surface-border rounded-xl text-sm text-white placeholder-white/25 focus:outline-none focus:border-gold-500/50 transition-colors" />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/50">Active</span>
                  <button type="button" onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))} className="flex items-center gap-2">
                    {form.is_active ? <><ToggleRight className="w-5 h-5 text-gold-400" /><span className="text-gold-400 text-xs font-medium">Active</span></> : <><ToggleLeft className="w-5 h-5 text-white/30" /><span className="text-white/30 text-xs">Inactive</span></>}
                  </button>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-surface-border flex gap-3 justify-end">
                <button onClick={closeForm} className="h-9 px-4 rounded-xl bg-graphite-700 text-white/60 text-sm hover:text-white transition-colors">Cancel</button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 h-9 px-5 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50">
                  {saving ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Saving…</> : <><CheckCircle2 className="w-3.5 h-3.5" />{editing ? 'Update' : 'Add'}</>}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
