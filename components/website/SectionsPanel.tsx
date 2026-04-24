'use client'
// components/website/SectionsPanel.tsx
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Eye, EyeOff, GripVertical, X, Check, AlertTriangle, ChevronDown, ChevronUp,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { SECTION_TYPE_META, type SectionType } from '@/lib/website/types'

interface SiteSection {
  id: string; tenant_id: string; page_id: string
  section_type: SectionType; section_key: string | null
  content: Record<string, unknown>; sort_order: number
  is_visible: boolean; created_at: string; updated_at: string
}

interface Props {
  pageId:   string
  tenantId: string
}

const SECTION_OPTIONS = Object.values(SECTION_TYPE_META).map((m) => ({
  value: m.type, label: m.label, description: m.description,
}))

export function SectionsPanel({ pageId, tenantId }: Props) {
  const [sections,      setSections]      = useState<SiteSection[]>([])
  const [loading,       setLoading]       = useState(true)
  const [showPicker,    setShowPicker]    = useState(false)
  const [addingType,    setAddingType]    = useState<SectionType | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState<string | null>(null)
  const [editingId,     setEditingId]     = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/website/sections?page_id=${pageId}`)
      .then((r) => r.json())
      .then((j) => setSections(j.sections ?? []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [pageId])

  async function addSection(type: SectionType) {
    setAddingType(type)
    const meta = SECTION_TYPE_META[type]
    try {
      const res = await fetch('/api/website/sections', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          page_id:      pageId,
          section_type: type,
          content:      meta.defaultContent,
          sort_order:   sections.length,
          is_visible:   true,
        }),
      })
      const json = await res.json()
      if (res.ok) {
        setSections((prev) => [...prev, json.section as SiteSection])
        setShowPicker(false)
      }
    } finally {
      setAddingType(null)
    }
  }

  async function toggleVisibility(section: SiteSection) {
    const res = await fetch(`/api/website/sections/${section.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_visible: !section.is_visible }),
    })
    if (res.ok) {
      const { section: updated } = await res.json()
      setSections((prev) => prev.map((s) => s.id === updated.id ? updated : s))
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      const res = await fetch(`/api/website/sections/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSections((prev) => prev.filter((s) => s.id !== id))
        if (editingId === id) setEditingId(null)
      }
    } finally {
      setDeleting(null)
      setDeleteConfirm(null)
    }
  }

  async function moveSection(id: string, direction: 'up' | 'down') {
    const idx = sections.findIndex((s) => s.id === id)
    if (idx < 0) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= sections.length) return

    const reordered = [...sections]
    ;[reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]]
    const withOrder = reordered.map((s, i) => ({ ...s, sort_order: i }))
    setSections(withOrder)

    await Promise.all(
      withOrder
        .filter((s, i) => s.sort_order !== sections[i]?.sort_order)
        .map((s) =>
          fetch(`/api/website/sections/${s.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ sort_order: s.sort_order }),
          })
        )
    )
  }

  if (loading) {
    return (
      <div className="py-6 text-center text-sm text-white/30">Loading sections…</div>
    )
  }

  return (
    <div className="space-y-2">
      {sections.length === 0 && !showPicker && (
        <div className="rounded-xl border border-dashed border-surface-border py-6 text-center">
          <p className="text-xs text-white/30 mb-3">No sections on this page</p>
          <button
            onClick={() => setShowPicker(true)}
            className="text-xs text-gold-400 hover:text-gold-300 transition-colors"
          >
            + Add first section
          </button>
        </div>
      )}

      <AnimatePresence>
        {sections.map((section, idx) => (
          <motion.div
            key={section.id}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="rounded-xl border border-surface-border bg-graphite-800/50 overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-3.5 py-2.5">
              <GripVertical className="h-4 w-4 text-white/15 shrink-0" />

              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/70">
                  {SECTION_TYPE_META[section.section_type]?.label ?? section.section_type}
                </p>
                {!section.is_visible && (
                  <p className="text-2xs text-white/25">Hidden</p>
                )}
              </div>

              {/* Reorder */}
              <div className="flex gap-0.5">
                <button
                  disabled={idx === 0}
                  onClick={() => moveSection(section.id, 'up')}
                  className="h-6 w-6 rounded-md text-white/25 hover:text-white/60 hover:bg-white/8 transition-colors flex items-center justify-center disabled:opacity-20"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  disabled={idx === sections.length - 1}
                  onClick={() => moveSection(section.id, 'down')}
                  className="h-6 w-6 rounded-md text-white/25 hover:text-white/60 hover:bg-white/8 transition-colors flex items-center justify-center disabled:opacity-20"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Toggle visibility */}
              <button
                onClick={() => toggleVisibility(section)}
                className="h-6 w-6 rounded-md text-white/25 hover:text-white/60 hover:bg-white/8 transition-colors flex items-center justify-center"
                title={section.is_visible ? 'Hide section' : 'Show section'}
              >
                {section.is_visible
                  ? <Eye className="h-3.5 w-3.5" />
                  : <EyeOff className="h-3.5 w-3.5" />
                }
              </button>

              {/* Edit */}
              <button
                onClick={() => setEditingId(editingId === section.id ? null : section.id)}
                className={cn(
                  'h-6 px-2 rounded-md text-2xs font-medium transition-colors',
                  editingId === section.id
                    ? 'bg-gold-500/15 text-gold-400'
                    : 'text-white/25 hover:text-white/60 hover:bg-white/8'
                )}
              >
                {editingId === section.id ? 'Close' : 'Edit'}
              </button>

              {/* Delete */}
              {deleteConfirm === section.id ? (
                <div className="flex items-center gap-1">
                  <span className="text-2xs text-red-400 flex items-center gap-0.5">
                    <AlertTriangle className="h-3 w-3" /> Sure?
                  </span>
                  <button
                    onClick={() => handleDelete(section.id)}
                    disabled={deleting === section.id}
                    className="h-6 w-6 rounded-md text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors flex items-center justify-center disabled:opacity-50"
                  >
                    {deleting === section.id ? '…' : <Check className="h-3 w-3" />}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="h-6 w-6 rounded-md text-white/30 hover:text-white hover:bg-white/8 transition-colors flex items-center justify-center"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDeleteConfirm(section.id)}
                  className="h-6 w-6 rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/8 transition-colors flex items-center justify-center"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Inline content editor */}
            <AnimatePresence>
              {editingId === section.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="overflow-hidden border-t border-surface-border"
                >
                  <SectionContentEditor section={section} onUpdate={(updated) => {
                    setSections((prev) => prev.map((s) => s.id === updated.id ? updated : s))
                  }} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Section picker */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="rounded-xl border border-gold-500/20 bg-graphite-900/80 p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-white/50 uppercase tracking-widest">Add Section</p>
              <button onClick={() => setShowPicker(false)} className="text-white/30 hover:text-white transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {SECTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => addSection(opt.value)}
                  disabled={addingType !== null}
                  className="text-left px-3 py-2.5 rounded-lg border border-surface-border hover:border-gold-500/30 hover:bg-gold-500/5 transition-colors disabled:opacity-50"
                >
                  <p className="text-xs font-semibold text-white">
                    {addingType === opt.value ? 'Adding…' : opt.label}
                  </p>
                  <p className="text-2xs text-white/30 leading-snug mt-0.5 line-clamp-1">{opt.description}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {sections.length > 0 && !showPicker && (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full h-8 rounded-xl border border-dashed border-surface-border text-xs text-white/30 hover:text-white/60 hover:border-white/20 transition-colors flex items-center justify-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Section
        </button>
      )}
    </div>
  )
}

// ── Inline Section Content Editor ─────────────────────────────────────────────

interface EditorProps {
  section:  SiteSection
  onUpdate: (updated: SiteSection) => void
}

function SectionContentEditor({ section, onUpdate }: EditorProps) {
  const [content, setContent] = useState<Record<string, unknown>>(section.content as Record<string, unknown>)
  const [saving,  setSaving]  = useState(false)
  const [saved,   setSaved]   = useState(false)

  const input = 'w-full bg-graphite-800 border border-surface-border rounded-lg px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/40 transition-colors'
  const label = 'block text-2xs font-semibold text-white/40 uppercase tracking-wider mb-1'

  function set(key: string, value: unknown) {
    setContent((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch(`/api/website/sections/${section.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content }),
      })
      if (res.ok) {
        const { section: updated } = await res.json()
        onUpdate(updated)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  const fields = buildFieldsForType(section.section_type, content)

  return (
    <div className="px-3.5 py-4 space-y-3 bg-graphite-900/40">
      <p className="text-2xs text-white/25 uppercase tracking-widest font-semibold">
        {SECTION_TYPE_META[section.section_type]?.label} Content
      </p>

      {fields.map((field) => (
        <div key={field.key}>
          <label className={label}>{field.label}</label>
          {field.type === 'textarea' ? (
            <textarea
              className={cn(input, 'resize-none h-16')}
              value={String(content[field.key] ?? '')}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          ) : field.type === 'checkbox' ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(content[field.key])}
                onChange={(e) => set(field.key, e.target.checked)}
                className="h-4 w-4 rounded border-surface-border bg-graphite-700 accent-gold-500"
              />
              <span className="text-xs text-white/60">{field.placeholder}</span>
            </label>
          ) : (
            <input
              className={input}
              type={field.type ?? 'text'}
              value={String(content[field.key] ?? '')}
              onChange={(e) => set(field.key, e.target.value)}
              placeholder={field.placeholder}
            />
          )}
        </div>
      ))}

      <div className="flex items-center justify-end gap-2 pt-1">
        {saved && <span className="text-xs text-emerald-400">Saved ✓</span>}
        <Button variant="primary" size="sm" onClick={save} loading={saving}>
          Save Content
        </Button>
      </div>
    </div>
  )
}

interface FieldDef { key: string; label: string; type?: string; placeholder?: string }

function buildFieldsForType(type: SectionType, _content: Record<string, unknown>): FieldDef[] {
  const fieldMap: Partial<Record<SectionType, FieldDef[]>> = {
    hero: [
      { key: 'headline',    label: 'Headline',    placeholder: 'Welcome to our store' },
      { key: 'subheadline', label: 'Subheadline', type: 'textarea', placeholder: 'Discover premium products…' },
      { key: 'ctaLabel',    label: 'CTA Button Label',  placeholder: 'Shop Now' },
      { key: 'ctaHref',     label: 'CTA Button Link',   placeholder: '/shop' },
      { key: 'backgroundImage', label: 'Background Image URL', placeholder: 'https://…' },
      { key: 'overlay',     label: 'Overlay', type: 'checkbox', placeholder: 'Enable dark overlay' },
    ],
    feature_grid: [
      { key: 'headline', label: 'Headline', placeholder: 'Why Choose Us' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea', placeholder: 'Optional subtitle…' },
    ],
    cta: [
      { key: 'headline', label: 'Headline',   placeholder: 'Ready to Get Started?' },
      { key: 'body',     label: 'Body Text',  type: 'textarea', placeholder: 'Optional body text…' },
      { key: 'ctaLabel', label: 'Button Label', placeholder: 'Get Started' },
      { key: 'ctaHref',  label: 'Button Link',  placeholder: '/shop' },
    ],
    contact: [
      { key: 'headline', label: 'Headline', placeholder: 'Get In Touch' },
      { key: 'body',     label: 'Body',     type: 'textarea', placeholder: 'Optional message…' },
      { key: 'email',    label: 'Email',    placeholder: 'hello@business.com' },
      { key: 'phone',    label: 'Phone',    placeholder: '+1 555 000 0000' },
      { key: 'address',  label: 'Address',  placeholder: '123 Main St, City' },
      { key: 'showForm', label: 'Show Form', type: 'checkbox', placeholder: 'Enable contact form' },
    ],
    rich_text: [
      { key: 'html', label: 'HTML Content', type: 'textarea', placeholder: '<p>Your content here</p>' },
    ],
    banner: [
      { key: 'text',     label: 'Banner Text', placeholder: 'Free shipping on orders over $50!' },
      { key: 'ctaLabel', label: 'CTA Label (optional)', placeholder: 'Shop Now' },
      { key: 'ctaHref',  label: 'CTA Link (optional)',  placeholder: '/shop' },
    ],
    testimonials: [
      { key: 'headline', label: 'Section Headline', placeholder: 'What Our Customers Say' },
    ],
    faq: [
      { key: 'headline', label: 'Section Headline', placeholder: 'Frequently Asked Questions' },
    ],
    about: [
      { key: 'headline', label: 'Headline', placeholder: 'About Us' },
      { key: 'body',     label: 'Body',     type: 'textarea', placeholder: 'Tell your story…' },
      { key: 'image',    label: 'Image URL', placeholder: 'https://…' },
    ],
    product_grid: [
      { key: 'headline', label: 'Section Headline', placeholder: 'Featured Products' },
      { key: 'subtitle', label: 'Subtitle', placeholder: 'Optional subtitle' },
      { key: 'allHref',  label: 'View All Link', placeholder: '/shop' },
    ],
  }

  return fieldMap[type] ?? [
    { key: 'headline', label: 'Headline', placeholder: 'Enter headline…' },
  ]
}
