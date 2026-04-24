'use client'
// components/website/PagesClient.tsx
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, FileText, Pencil, Trash2, ChevronDown, ChevronRight,
  Eye, EyeOff, Layers, X, Check, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { fadeUp, staggerContainer } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { SectionsPanel } from '@/components/website/SectionsPanel'
import type { PageType, PageStatus } from '@/lib/website/types'

interface SitePage {
  id: string; tenant_id: string; slug: string; title: string | null
  meta_description: string | null; page_type: PageType; status: PageStatus
  sort_order: number; created_at: string; updated_at: string
}

const PAGE_TYPE_OPTIONS: { value: PageType; label: string }[] = [
  { value: 'home',     label: 'Home' },
  { value: 'shop',     label: 'Shop' },
  { value: 'contact',  label: 'Contact' },
  { value: 'about',    label: 'About' },
  { value: 'faq',      label: 'FAQ' },
  { value: 'custom',   label: 'Custom' },
]

interface Props {
  tenantId:     string
  initialPages: SitePage[]
}

export function PagesClient({ tenantId, initialPages }: Props) {
  const [pages,          setPages]          = useState<SitePage[]>(initialPages)
  const [showForm,       setShowForm]       = useState(false)
  const [editTarget,     setEditTarget]     = useState<SitePage | null>(null)
  const [deleteConfirm,  setDeleteConfirm]  = useState<string | null>(null)
  const [deleting,       setDeleting]       = useState<string | null>(null)
  const [expandedPage,   setExpandedPage]   = useState<string | null>(null)
  const [saving,         setSaving]         = useState(false)
  const [formError,      setFormError]      = useState<string | null>(null)

  // form state
  const [fSlug,        setFSlug]        = useState('')
  const [fTitle,       setFTitle]       = useState('')
  const [fMeta,        setFMeta]        = useState('')
  const [fPageType,    setFPageType]    = useState<PageType>('custom')
  const [fStatus,      setFStatus]      = useState<PageStatus>('draft')

  function openCreate() {
    setEditTarget(null)
    setFSlug(''); setFTitle(''); setFMeta('')
    setFPageType('custom'); setFStatus('draft')
    setFormError(null)
    setShowForm(true)
  }

  function openEdit(page: SitePage) {
    setEditTarget(page)
    setFSlug(page.slug); setFTitle(page.title ?? ''); setFMeta(page.meta_description ?? '')
    setFPageType(page.page_type); setFStatus(page.status)
    setFormError(null)
    setShowForm(true)
  }

  async function handleSave() {
    if (!fSlug.trim()) { setFormError('Slug is required'); return }
    setSaving(true); setFormError(null)
    try {
      const url    = editTarget ? `/api/website/pages/${editTarget.id}` : '/api/website/pages'
      const method = editTarget ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenant_id:        tenantId,
          slug:             fSlug.trim(),
          title:            fTitle.trim() || null,
          meta_description: fMeta.trim() || null,
          page_type:        fPageType,
          status:           fStatus,
          sort_order:       editTarget?.sort_order ?? pages.length,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      const saved = json.page as SitePage
      setPages((prev) =>
        editTarget
          ? prev.map((p) => p.id === saved.id ? saved : p)
          : [...prev, saved]
      )
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
      const res = await fetch(`/api/website/pages/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setPages((prev) => prev.filter((p) => p.id !== id))
        if (expandedPage === id) setExpandedPage(null)
      }
    } finally {
      setDeleting(null)
      setDeleteConfirm(null)
    }
  }

  async function toggleStatus(page: SitePage) {
    const next = page.status === 'published' ? 'draft' : 'published'
    const res = await fetch(`/api/website/pages/${page.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ tenant_id: tenantId, status: next }),
    })
    if (res.ok) {
      const { page: updated } = await res.json()
      setPages((prev) => prev.map((p) => p.id === updated.id ? updated : p))
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Pages</h1>
          <p className="text-sm text-white/40 mt-0.5">{pages.length} page{pages.length !== 1 ? 's' : ''}</p>
        </div>
        <Button variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          New Page
        </Button>
      </div>

      {/* Page list */}
      {pages.length === 0 ? (
        <EmptyState onAdd={openCreate} />
      ) : (
        <motion.div
          variants={staggerContainer(0.04)}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {pages.map((page) => (
            <motion.div key={page.id} variants={fadeUp}>
              <div className="rounded-2xl border border-surface-border overflow-hidden">
                {/* Page row */}
                <div className="flex items-center gap-3 px-5 py-4 bg-graphite-800/60 hover:bg-graphite-800/80 transition-colors">
                  <button
                    onClick={() => setExpandedPage(expandedPage === page.id ? null : page.id)}
                    className="p-1 text-white/30 hover:text-white/70 transition-colors"
                  >
                    {expandedPage === page.id
                      ? <ChevronDown className="h-4 w-4" />
                      : <ChevronRight className="h-4 w-4" />
                    }
                  </button>

                  <div className="h-8 w-8 rounded-lg bg-violet-400/10 border border-violet-400/20 flex items-center justify-center shrink-0">
                    <FileText className="h-4 w-4 text-violet-400" strokeWidth={1.75} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {page.title ?? `/${page.slug}`}
                    </p>
                    <p className="text-xs text-white/30">/{page.slug} · {page.page_type}</p>
                  </div>

                  <span className={cn(
                    'text-2xs px-2 py-0.5 rounded-md font-medium border shrink-0',
                    page.status === 'published'
                      ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
                      : 'text-gold-400 bg-gold-400/10 border-gold-400/20',
                  )}>
                    {page.status}
                  </span>

                  {/* Actions */}
                  {deleteConfirm === page.id ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-red-400 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Delete?
                      </span>
                      <button
                        onClick={() => handleDelete(page.id)}
                        disabled={deleting === page.id}
                        className="h-7 px-2 rounded-lg text-xs text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                      >
                        {deleting === page.id ? '…' : <Check className="h-3.5 w-3.5" />}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="h-7 w-7 rounded-lg text-white/40 hover:text-white hover:bg-white/8 transition-colors flex items-center justify-center"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => toggleStatus(page)}
                        title={page.status === 'published' ? 'Set to draft' : 'Publish'}
                        className="h-8 w-8 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors flex items-center justify-center"
                      >
                        {page.status === 'published'
                          ? <EyeOff className="h-3.5 w-3.5" />
                          : <Eye className="h-3.5 w-3.5" />
                        }
                      </button>
                      <button
                        onClick={() => openEdit(page)}
                        className="h-8 w-8 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors flex items-center justify-center"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(page.id)}
                        className="h-8 w-8 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-colors flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Sections panel */}
                <AnimatePresence>
                  {expandedPage === page.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden border-t border-surface-border"
                    >
                      <div className="px-5 py-4 bg-graphite-900/60">
                        <div className="flex items-center gap-2 mb-3">
                          <Layers className="h-3.5 w-3.5 text-white/30" />
                          <span className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                            Sections
                          </span>
                        </div>
                        <SectionsPanel pageId={page.id} tenantId={tenantId} />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </motion.div>
      )}

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <PageFormModal
            editTarget={editTarget}
            slug={fSlug}        onSlug={setFSlug}
            title={fTitle}      onTitle={setFTitle}
            meta={fMeta}        onMeta={setFMeta}
            pageType={fPageType} onPageType={setFPageType}
            status={fStatus}    onStatus={setFStatus}
            saving={saving}
            error={formError}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setFormError(null) }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Page Form Modal ───────────────────────────────────────────────────────────

interface FormModalProps {
  editTarget: SitePage | null
  slug: string;     onSlug:     (v: string) => void
  title: string;    onTitle:    (v: string) => void
  meta: string;     onMeta:     (v: string) => void
  pageType: PageType; onPageType: (v: PageType) => void
  status: PageStatus; onStatus:   (v: PageStatus) => void
  saving: boolean
  error:  string | null
  onSave:   () => void
  onCancel: () => void
}

function PageFormModal({
  editTarget, slug, onSlug, title, onTitle, meta, onMeta,
  pageType, onPageType, status, onStatus, saving, error, onSave, onCancel,
}: FormModalProps) {
  const input = 'w-full bg-graphite-700 border border-surface-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/20 transition-colors'
  const label = 'block text-xs font-semibold text-white/50 uppercase tracking-wider mb-1.5'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-lg bg-graphite-900 border border-surface-border rounded-2xl shadow-panel-lg overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-border">
          <h2 className="text-base font-semibold text-white">
            {editTarget ? 'Edit Page' : 'New Page'}
          </h2>
          <button onClick={onCancel} className="text-white/40 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          <div>
            <label className={label}>Page Title</label>
            <input className={input} placeholder="e.g. Our Story" value={title} onChange={(e) => onTitle(e.target.value)} />
          </div>

          <div>
            <label className={label}>Slug <span className="text-red-400">*</span></label>
            <div className="flex items-center bg-graphite-700 border border-surface-border rounded-xl overflow-hidden focus-within:border-gold-500/50 focus-within:ring-1 focus-within:ring-gold-500/20 transition-colors">
              <span className="pl-3.5 text-sm text-white/30 select-none">/</span>
              <input
                className="flex-1 bg-transparent px-1.5 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none"
                placeholder="about-us"
                value={slug}
                onChange={(e) => onSlug(e.target.value.replace(/\s+/g, '-').toLowerCase())}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={label}>Page Type</label>
              <select
                className={cn(input, 'cursor-pointer')}
                value={pageType}
                onChange={(e) => onPageType(e.target.value as PageType)}
              >
                {PAGE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Status</label>
              <select
                className={cn(input, 'cursor-pointer')}
                value={status}
                onChange={(e) => onStatus(e.target.value as PageStatus)}
              >
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </select>
            </div>
          </div>

          <div>
            <label className={label}>Meta Description</label>
            <textarea
              className={cn(input, 'resize-none h-20')}
              placeholder="Brief description for search engines (optional)"
              value={meta}
              onChange={(e) => onMeta(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-surface-border">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="primary" onClick={onSave} loading={saving}>
            {editTarget ? 'Save Changes' : 'Create Page'}
          </Button>
        </div>
      </motion.div>
    </motion.div>
  )
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl border border-dashed border-surface-border">
      <div className="h-16 w-16 rounded-2xl bg-violet-400/10 border border-violet-400/20 flex items-center justify-center mb-4">
        <FileText className="h-8 w-8 text-violet-400/60" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">No pages yet</h3>
      <p className="text-sm text-white/40 mb-6 max-w-xs">
        Create your first page to start building your website.
      </p>
      <Button variant="primary" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Create Page
      </Button>
    </div>
  )
}
