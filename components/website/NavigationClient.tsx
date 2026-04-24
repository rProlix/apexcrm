'use client'
// components/website/NavigationClient.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, Eye, EyeOff, X, Check, AlertTriangle,
  Navigation, ChevronUp, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { staggerContainer, fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'

interface NavItem {
  id: string; tenant_id: string; label: string; href: string
  sort_order: number; is_visible: boolean; location: 'header' | 'footer'
  created_at: string; updated_at: string
}

interface Props {
  tenantId:     string
  initialItems: NavItem[]
}

export function NavigationClient({ tenantId, initialItems }: Props) {
  const [items,         setItems]         = useState<NavItem[]>(initialItems)
  const [showForm,      setShowForm]      = useState(false)
  const [editTarget,    setEditTarget]    = useState<NavItem | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [saving,        setSaving]        = useState(false)
  const [formError,     setFormError]     = useState<string | null>(null)

  const [fLabel,    setFLabel]    = useState('')
  const [fHref,     setFHref]     = useState('')
  const [fLocation, setFLocation] = useState<'header' | 'footer'>('header')

  const header = items.filter((i) => i.location === 'header').sort((a, b) => a.sort_order - b.sort_order)
  const footer = items.filter((i) => i.location === 'footer').sort((a, b) => a.sort_order - b.sort_order)

  function openCreate(location: 'header' | 'footer' = 'header') {
    setEditTarget(null)
    setFLabel(''); setFHref(''); setFLocation(location)
    setFormError(null); setShowForm(true)
  }

  function openEdit(item: NavItem) {
    setEditTarget(item)
    setFLabel(item.label); setFHref(item.href); setFLocation(item.location)
    setFormError(null); setShowForm(true)
  }

  async function handleSave() {
    if (!fLabel.trim() || !fHref.trim()) {
      setFormError('Label and link are required')
      return
    }
    setSaving(true); setFormError(null)
    try {
      if (editTarget) {
        const res = await fetch('/api/website/navigation', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: editTarget.id, tenant_id: tenantId, label: fLabel.trim(), href: fHref.trim(), location: fLocation }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setItems((prev) => prev.map((i) => i.id === json.item.id ? json.item : i))
      } else {
        const res = await fetch('/api/website/navigation', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            tenant_id:  tenantId,
            label:      fLabel.trim(),
            href:       fHref.trim(),
            location:   fLocation,
            sort_order: items.filter((i) => i.location === fLocation).length,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error)
        setItems((prev) => [...prev, json.item])
      }
      setShowForm(false)
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/website/navigation?id=${id}`, { method: 'DELETE' })
      if (res.ok) setItems((prev) => prev.filter((i) => i.id !== id))
    } finally {
      setDeleting(null); setDeleteConfirm(null)
    }
  }

  async function toggleVisibility(item: NavItem) {
    const res = await fetch('/api/website/navigation', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id: item.id, tenant_id: tenantId, is_visible: !item.is_visible }),
    })
    if (res.ok) {
      const { item: updated } = await res.json()
      setItems((prev) => prev.map((i) => i.id === updated.id ? updated : i))
    }
  }

  async function moveItem(id: string, location: 'header' | 'footer', direction: 'up' | 'down') {
    const group  = items.filter((i) => i.location === location).sort((a, b) => a.sort_order - b.sort_order)
    const idx    = group.findIndex((i) => i.id === id)
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= group.length) return

    const reordered = [...group]
    ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
    const withOrder = reordered.map((item, i) => ({ ...item, sort_order: i }))

    setItems((prev) => [
      ...prev.filter((i) => i.location !== location),
      ...withOrder,
    ])

    await Promise.all(
      withOrder.map((item) =>
        fetch('/api/website/navigation', {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ id: item.id, tenant_id: tenantId, sort_order: item.sort_order }),
        })
      )
    )
  }

  const input = 'w-full bg-graphite-700 border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors'
  const label = 'block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5'

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Navigation</h1>
          <p className="text-sm text-white/40 mt-0.5">Manage your site header and footer links</p>
        </div>
        <Button variant="primary" onClick={() => openCreate('header')}>
          <Plus className="h-4 w-4" />
          Add Link
        </Button>
      </div>

      {/* Header nav */}
      <NavGroup
        title="Header"
        items={header}
        location="header"
        onAdd={() => openCreate('header')}
        onEdit={openEdit}
        onDelete={(id) => setDeleteConfirm(id)}
        onDeleteConfirm={handleDelete}
        onDeleteCancel={() => setDeleteConfirm(null)}
        deleteConfirm={deleteConfirm}
        deleting={deleting}
        onToggle={toggleVisibility}
        onMove={moveItem}
      />

      {/* Footer nav */}
      <NavGroup
        title="Footer"
        items={footer}
        location="footer"
        onAdd={() => openCreate('footer')}
        onEdit={openEdit}
        onDelete={(id) => setDeleteConfirm(id)}
        onDeleteConfirm={handleDelete}
        onDeleteCancel={() => setDeleteConfirm(null)}
        deleteConfirm={deleteConfirm}
        deleting={deleting}
        onToggle={toggleVisibility}
        onMove={moveItem}
      />

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowForm(false) }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-md bg-graphite-900 border border-surface-border rounded-2xl shadow-panel-lg overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
                <h2 className="text-base font-semibold text-white">
                  {editTarget ? 'Edit Link' : 'New Nav Link'}
                </h2>
                <button onClick={() => setShowForm(false)} className="text-white/40 hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-4">
                {formError && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                    {formError}
                  </div>
                )}
                <div>
                  <label className={label}>Label <span className="text-red-400">*</span></label>
                  <input className={input} placeholder="e.g. Shop" value={fLabel} onChange={(e) => setFLabel(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Link URL <span className="text-red-400">*</span></label>
                  <input className={input} placeholder="/shop" value={fHref} onChange={(e) => setFHref(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Location</label>
                  <div className="flex gap-3">
                    {(['header', 'footer'] as const).map((loc) => (
                      <button
                        key={loc}
                        onClick={() => setFLocation(loc)}
                        className={cn(
                          'flex-1 h-10 rounded-xl border text-sm font-medium transition-colors capitalize',
                          fLocation === loc
                            ? 'border-gold-500/40 bg-gold-500/10 text-gold-400'
                            : 'border-surface-border text-white/40 hover:text-white hover:border-white/20'
                        )}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border">
                <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button variant="primary" onClick={handleSave} loading={saving}>
                  {editTarget ? 'Save Changes' : 'Add Link'}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Nav Group ─────────────────────────────────────────────────────────────────

interface NavGroupProps {
  title:          string
  items:          NavItem[]
  location:       'header' | 'footer'
  onAdd:          () => void
  onEdit:         (item: NavItem) => void
  onDelete:       (id: string) => void
  onDeleteConfirm:(id: string) => void
  onDeleteCancel: () => void
  deleteConfirm:  string | null
  deleting:       string | null
  onToggle:       (item: NavItem) => void
  onMove:         (id: string, loc: 'header' | 'footer', dir: 'up' | 'down') => void
}

function NavGroup({
  title, items, location, onAdd, onEdit, onDelete,
  onDeleteConfirm, onDeleteCancel, deleteConfirm, deleting, onToggle, onMove,
}: NavGroupProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-white/30" />
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">{title}</h2>
          <span className="text-2xs px-1.5 py-0.5 rounded bg-white/8 text-white/30 font-medium">{items.length}</span>
        </div>
        <button onClick={onAdd} className="text-xs text-gold-400 hover:text-gold-300 transition-colors flex items-center gap-1">
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-border py-8 text-center">
          <p className="text-sm text-white/30 mb-2">No {title.toLowerCase()} links yet</p>
          <button onClick={onAdd} className="text-xs text-gold-400 hover:text-gold-300 transition-colors">
            + Add first link
          </button>
        </div>
      ) : (
        <motion.div
          variants={staggerContainer(0.04)}
          initial="hidden"
          animate="visible"
          className="rounded-2xl border border-surface-border overflow-hidden"
        >
          {items.map((item, idx) => (
            <motion.div
              key={item.id}
              variants={fadeUp}
              className={cn(
                'flex items-center gap-3 px-5 py-3.5 hover:bg-white/2 transition-colors',
                idx !== 0 && 'border-t border-surface-border',
                !item.is_visible && 'opacity-50',
              )}
            >
              <div className="flex flex-col gap-0.5">
                <button
                  disabled={idx === 0}
                  onClick={() => onMove(item.id, location, 'up')}
                  className="h-4 w-4 text-white/20 hover:text-white/50 transition-colors disabled:opacity-20"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  disabled={idx === items.length - 1}
                  onClick={() => onMove(item.id, location, 'down')}
                  className="h-4 w-4 text-white/20 hover:text-white/50 transition-colors disabled:opacity-20"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="text-xs text-white/30">{item.href}</p>
              </div>

              {deleteConfirm === item.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" /> Delete?
                  </span>
                  <button
                    onClick={() => onDeleteConfirm(item.id)}
                    disabled={deleting === item.id}
                    className="h-7 w-7 rounded-lg text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors flex items-center justify-center disabled:opacity-50"
                  >
                    {deleting === item.id ? '…' : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={onDeleteCancel}
                    className="h-7 w-7 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex items-center justify-center"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onToggle(item)}
                    className="h-8 w-8 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors flex items-center justify-center"
                    title={item.is_visible ? 'Hide' : 'Show'}
                  >
                    {item.is_visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => onEdit(item)}
                    className="h-8 w-8 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors flex items-center justify-center"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="h-8 w-8 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-colors flex items-center justify-center"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
