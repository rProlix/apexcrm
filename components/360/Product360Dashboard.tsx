'use client'
// components/360/Product360Dashboard.tsx
// Main client-side dashboard for the 360 Product Viewer module.
// Manages packages: list, create, upload frames, AI generate, attach to product, delete.

import {
  useState, useEffect, useRef, useCallback
} from 'react'
import {
  Plus, Rotate3D, Loader2, AlertCircle, Check,
  Zap, Upload, Trash2, Link2, RefreshCw, ChevronDown, ChevronUp,
  Package, Image as ImageIcon
} from 'lucide-react'
import dynamic from 'next/dynamic'

const Product360Viewer = dynamic(
  () => import('./Product360Viewer').then(m => m.Product360Viewer),
  { ssr: false, loading: () => <div className="w-full aspect-square rounded-2xl bg-zinc-900 animate-pulse" /> }
)

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant  { id: string; name: string; slug: string }
interface Product { id: string; name: string; spin_package_id: string | null }
interface PackageSummary {
  id:              string
  name:            string
  status:          string
  source_type:     string
  frame_count:     number
  frames_done:     number
  product_id:      string | null
  product_name:    string | null
  cover_image_url: string | null
  error_message:   string | null
  created_at:      string
}
interface Frame {
  frame_index:   number
  angle_degrees: number
  image_url:     string
}

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft:      'bg-zinc-700 text-zinc-300',
  queued:     'bg-blue-900/50 text-blue-300',
  generating: 'bg-amber-900/50 text-amber-300',
  ready:      'bg-emerald-900/50 text-emerald-300',
  failed:     'bg-red-900/50 text-red-300',
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[status] ?? STATUS_STYLES.draft}`}>
      {status === 'generating' && <Loader2 size={10} className="animate-spin" />}
      {status === 'ready' && <Check size={10} />}
      {status === 'failed' && <AlertCircle size={10} />}
      {status}
    </span>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: 'success' | 'error'; message: string }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)
  const push = useCallback((type: Toast['type'], message: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])
  return { toasts, push }
}

function ToastStack({ toasts }: { toasts: Toast[] }) {
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-md pointer-events-auto ${
          t.type === 'success'
            ? 'bg-emerald-900/80 border border-emerald-700 text-emerald-200'
            : 'bg-red-900/80 border border-red-700 text-red-200'
        }`}>
          {t.type === 'success' ? <Check size={14} /> : <AlertCircle size={14} />}
          {t.message}
        </div>
      ))}
    </div>
  )
}

// ─── Create Package Modal ────────────────────────────────────────────────────

interface CreateModalProps {
  tenantId:  string
  products:  Product[]
  onCreated: (pkg: PackageSummary) => void
  onClose:   () => void
  toast:     (type: 'success' | 'error', msg: string) => void
}

const FRAME_OPTIONS = [
  { count: 12, label: '12 frames', detail: '30° each · Fast' },
  { count: 24, label: '24 frames', detail: '15° each · Recommended' },
  { count: 36, label: '36 frames', detail: '10° each · Smooth' },
]

function CreatePackageModal({ tenantId, products, onCreated, onClose, toast }: CreateModalProps) {
  const [name,        setName]       = useState('')
  const [productId,   setProductId]  = useState('')
  const [description, setDesc]       = useState('')
  const [frameCount,  setFrameCount] = useState(24)
  const [sourceType,  setSource]     = useState<'manual' | 'ai'>('manual')
  const [saving,      setSaving]     = useState(false)

  async function handleCreate() {
    if (!description.trim() && sourceType === 'ai') {
      toast('error', 'Add a product description to use AI generation')
      return
    }
    setSaving(true)
    try {
      const res  = await fetch('/api/360/packages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId,
          productId: productId || undefined,
          name:        name.trim() || undefined,
          description: description.trim() || undefined,
          prompt:      description.trim() || undefined,
          frameCount,
          sourceType,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast('error', data.error ?? 'Failed to create'); return }
      toast('success', 'Package created!')
      onCreated({
        ...data.package,
        frames_done:  0,
        product_name: products.find(p => p.id === productId)?.name ?? null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">New 360° Package</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">✕</button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Product */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Product (optional)</label>
            <select
              value={productId}
              onChange={e => {
                setProductId(e.target.value)
                const p = products.find(x => x.id === e.target.value)
                if (p && !name) setName(`${p.name} — 360° Viewer`)
              }}
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
            >
              <option value="">— Select product (optional) —</option>
              {products.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Package Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Premium Watch — 360° Viewer"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-fuchsia-500 focus:outline-none"
            />
          </div>

          {/* Description / prompt */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Product Description
              <span className="ml-1.5 text-zinc-600">(used as AI prompt)</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={e => setDesc(e.target.value)}
              placeholder="Describe the product in detail — material, color, shape, finish…"
              className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-fuchsia-500 focus:outline-none resize-none"
            />
          </div>

          {/* Frame count */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Frame Count</label>
            <div className="grid grid-cols-3 gap-2">
              {FRAME_OPTIONS.map(({ count, label, detail }) => (
                <button
                  key={count}
                  onClick={() => setFrameCount(count)}
                  className={`rounded-xl border p-3 text-left transition-all ${
                    frameCount === count
                      ? 'border-fuchsia-500 bg-fuchsia-500/10'
                      : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                  }`}
                >
                  <p className={`text-sm font-semibold ${frameCount === count ? 'text-fuchsia-400' : 'text-white'}`}>{label}</p>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{detail}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Source type */}
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-2">Upload Method</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSource('manual')}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${
                  sourceType === 'manual'
                    ? 'border-fuchsia-500 bg-fuchsia-500/10'
                    : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                }`}
              >
                <Upload size={16} className={sourceType === 'manual' ? 'text-fuchsia-400' : 'text-zinc-400'} />
                <div>
                  <p className={`text-xs font-semibold ${sourceType === 'manual' ? 'text-fuchsia-400' : 'text-white'}`}>Manual Upload</p>
                  <p className="text-[11px] text-zinc-500">Upload frames yourself</p>
                </div>
              </button>
              <button
                onClick={() => setSource('ai')}
                className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${
                  sourceType === 'ai'
                    ? 'border-fuchsia-500 bg-fuchsia-500/10'
                    : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
                }`}
              >
                <Zap size={16} className={sourceType === 'ai' ? 'text-fuchsia-400' : 'text-zinc-400'} />
                <div>
                  <p className={`text-xs font-semibold ${sourceType === 'ai' ? 'text-fuchsia-400' : 'text-white'}`}>AI Generate</p>
                  <p className="text-[11px] text-zinc-500">Midjourney frames</p>
                </div>
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-fuchsia-600 px-5 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 disabled:opacity-50 transition-colors"
          >
            {saving ? <><Loader2 size={14} className="animate-spin" /> Creating…</> : 'Create Package'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Package Card ─────────────────────────────────────────────────────────────

interface PackageCardProps {
  pkg:       PackageSummary
  tenantId:  string
  products:  Product[]
  onRefresh: () => void
  toast:     (type: 'success' | 'error', msg: string) => void
}

function PackageCard({ pkg, tenantId, products, onRefresh, toast }: PackageCardProps) {
  const [expanded,   setExpanded]   = useState(false)
  const [frames,     setFrames]     = useState<Frame[]>([])
  const [loadFrames, setLoadFrames] = useState(false)
  const [generating, setGenerating] = useState(pkg.status === 'generating' || pkg.status === 'queued')
  const [currentPkg, setCurrentPkg] = useState(pkg)
  const [deleting,   setDeleting]   = useState(false)
  const [attaching,  setAttaching]  = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const fileRef                     = useRef<HTMLInputElement>(null)
  const pollRef                     = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll for status when generating
  useEffect(() => {
    if (!generating) return
    pollRef.current = setInterval(async () => {
      const r    = await fetch(`/api/360/packages/${pkg.id}`)
      const data = await r.json()
      if (!r.ok) return
      const updated = data.package
      setCurrentPkg({ ...updated, frames_done: updated.frames?.length ?? 0 })
      if (updated.status === 'ready' || updated.status === 'failed') {
        setGenerating(false)
        if (pollRef.current) clearInterval(pollRef.current)
        if (updated.status === 'ready') toast('success', `"${updated.name}" is ready!`)
        else toast('error', `Generation failed: ${updated.error_message ?? 'unknown error'}`)
        onRefresh()
      }
    }, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating])

  async function loadFrameData() {
    setLoadFrames(true)
    const r    = await fetch(`/api/360/packages/${pkg.id}/frames`)
    const data = await r.json()
    setFrames(data.frames ?? [])
    setLoadFrames(false)
  }

  function handleToggleExpand() {
    if (!expanded && !frames.length) loadFrameData()
    setExpanded(e => !e)
  }

  async function handleGenerate() {
    const r    = await fetch(`/api/360/packages/${pkg.id}/generate`, { method: 'POST' })
    const data = await r.json()
    if (!r.ok) { toast('error', data.error ?? 'Could not start generation'); return }
    setCurrentPkg(p => ({ ...p, status: 'queued' }))
    setGenerating(true)
    toast('success', 'Generation started!')
  }

  async function handleRetry() {
    const r    = await fetch(`/api/360/packages/${pkg.id}/generate`, { method: 'POST' })
    const data = await r.json()
    if (!r.ok) { toast('error', data.error ?? 'Retry failed'); return }
    setCurrentPkg(p => ({ ...p, status: 'queued', error_message: null }))
    setGenerating(true)
    toast('success', 'Retrying generation…')
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${currentPkg.name}"? This cannot be undone.`)) return
    setDeleting(true)
    const r = await fetch(`/api/360/packages/${pkg.id}`, { method: 'DELETE' })
    if (r.ok) { toast('success', 'Package deleted'); onRefresh() }
    else { const d = await r.json(); toast('error', d.error ?? 'Delete failed'); setDeleting(false) }
  }

  async function handleAttach(productId: string | null) {
    setAttaching(true)
    const r    = await fetch(`/api/360/packages/${pkg.id}/attach`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ productId }),
    })
    const data = await r.json()
    setAttaching(false)
    if (!r.ok) { toast('error', data.error ?? 'Attach failed'); return }
    const productName = products.find(p => p.id === productId)?.name ?? null
    setCurrentPkg(p => ({ ...p, product_id: productId, product_name: productName }))
    toast('success', productId ? `Attached to "${productName}"` : 'Detached from product')
    onRefresh()
  }

  async function handleFileUpload(frameIndex: number, file: File) {
    setUploading(true)
    const form = new FormData()
    form.append('frame_index', String(frameIndex))
    form.append('file', file)
    const r    = await fetch(`/api/360/packages/${pkg.id}/frames`, { method: 'POST', body: form })
    const data = await r.json()
    setUploading(false)
    if (!r.ok) { toast('error', data.error ?? 'Upload failed'); return }
    toast('success', `Frame ${frameIndex + 1} uploaded`)
    loadFrameData()
    if (data.status === 'ready') {
      setCurrentPkg(p => ({ ...p, status: 'ready', frames_done: data.frames_done }))
      toast('success', 'All frames complete — package is ready!')
    } else {
      setCurrentPkg(p => ({ ...p, frames_done: data.frames_done }))
    }
  }

  const p = currentPkg
  const progress = p.frame_count > 0 ? Math.round((p.frames_done / p.frame_count) * 100) : 0

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          {/* Cover thumbnail */}
          <div className="h-12 w-12 rounded-xl bg-zinc-800 shrink-0 overflow-hidden">
            {p.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.cover_image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center">
                <ImageIcon size={18} className="text-zinc-600" />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-white truncate">{p.name}</p>
              <StatusBadge status={p.status} />
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11px] text-zinc-500">
              <span>{p.frames_done}/{p.frame_count} frames</span>
              {p.product_name && (
                <span className="flex items-center gap-1">
                  <Package size={10} /> {p.product_name}
                </span>
              )}
              <span>{new Date(p.created_at).toLocaleDateString()}</span>
            </div>
          </div>

          <button onClick={handleToggleExpand} className="text-zinc-500 hover:text-white transition-colors shrink-0">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>

        {/* Progress bar */}
        {(p.status === 'generating' || p.status === 'queued' || (p.frames_done > 0 && p.frames_done < p.frame_count)) && (
          <div className="mt-3">
            <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  generating ? 'bg-gradient-to-r from-amber-500 to-orange-400' : 'bg-fuchsia-500'
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {p.status === 'failed' && p.error_message && (
          <div className="mt-3 rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-xs text-red-400">
            {p.error_message}
          </div>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-zinc-800 px-5 pb-5 pt-4 space-y-4">

          {/* 360 Viewer preview */}
          {p.status === 'ready' && frames.length > 0 && (
            <Product360Viewer
              frames={frames}
              label={p.name}
              autoRotate={false}
              className="max-w-sm mx-auto"
            />
          )}

          {/* Frame grid */}
          {loadFrames ? (
            <div className="flex items-center gap-2 text-zinc-500 text-xs py-2">
              <Loader2 size={12} className="animate-spin" /> Loading frames…
            </div>
          ) : frames.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-2">Frames ({frames.length})</p>
              <div className="grid gap-1" style={{
                gridTemplateColumns: `repeat(${Math.min(frames.length, 12)}, minmax(0, 1fr))`
              }}>
                {frames.map(f => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={f.frame_index} src={f.image_url} alt={`Frame ${f.frame_index}`}
                    className="w-full aspect-square rounded object-cover"
                    title={`Frame ${f.frame_index} · ${f.angle_degrees}°`}
                  />
                ))}
              </div>
            </div>
          ) : p.status === 'draft' ? (
            <p className="text-xs text-zinc-600 py-2">No frames yet. Upload manually or start AI generation.</p>
          ) : null}

          {/* Manual upload (for draft or manual packages) */}
          {(p.status === 'draft' || p.source_type === 'manual') && p.status !== 'generating' && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-2">Upload Frame Manually</p>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    await handleFileUpload(frames.length, file)
                    if (fileRef.current) fileRef.current.value = ''
                  }}
                />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 rounded-xl border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-600 disabled:opacity-50 transition-colors"
                >
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {uploading ? 'Uploading…' : `Upload frame ${frames.length + 1}`}
                </button>
                <span className="text-[11px] text-zinc-600">{frames.length}/{p.frame_count} frames</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {/* AI Generate / Retry */}
            {p.status === 'draft' && (
              <button
                onClick={handleGenerate}
                className="flex items-center gap-1.5 rounded-xl bg-fuchsia-600 px-4 py-2 text-xs font-semibold text-white hover:bg-fuchsia-500 transition-colors"
              >
                <Zap size={12} /> Generate with AI
              </button>
            )}
            {p.status === 'failed' && (
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 rounded-xl border border-amber-600 px-4 py-2 text-xs font-medium text-amber-400 hover:bg-amber-600/10 transition-colors"
              >
                <RefreshCw size={12} /> Retry Generation
              </button>
            )}

            {/* Attach / detach */}
            {p.status === 'ready' && (
              <div className="flex items-center gap-2">
                <select
                  onChange={e => { if (e.target.value) handleAttach(e.target.value) }}
                  disabled={attaching}
                  className="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white focus:border-fuchsia-500 focus:outline-none"
                  defaultValue=""
                >
                  <option value="" disabled>Attach to product…</option>
                  {products.map(pr => (
                    <option key={pr.id} value={pr.id}>{pr.name}</option>
                  ))}
                </select>
                {p.product_id && (
                  <button
                    onClick={() => handleAttach(null)}
                    disabled={attaching}
                    className="flex items-center gap-1.5 rounded-xl border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:border-red-700 hover:text-red-400 transition-colors"
                  >
                    <Link2 size={12} /> Detach
                  </button>
                )}
              </div>
            )}

            {/* Delete */}
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="ml-auto flex items-center gap-1.5 rounded-xl border border-zinc-800 px-3 py-2 text-xs text-zinc-500 hover:border-red-800 hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

interface Props {
  isOwner:         boolean
  defaultTenantId: string
}

export default function Product360Dashboard({ isOwner, defaultTenantId }: Props) {
  const [tenantId,    setTenantId]    = useState(defaultTenantId)
  const [tenants,     setTenants]     = useState<Tenant[]>([])
  const [products,    setProducts]    = useState<Product[]>([])
  const [packages,    setPackages]    = useState<PackageSummary[]>([])
  const [loadingPkgs, setLoadingPkgs] = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)
  const { toasts, push: toast }       = useToast()

  // Load tenants for owner
  useEffect(() => {
    if (!isOwner) return
    fetch('/api/owner/tenants')
      .then(r => r.json())
      .then(d => setTenants(d.tenants ?? []))
      .catch(() => {})
  }, [isOwner])

  // Load products for selected tenant
  useEffect(() => {
    if (!tenantId) return
    fetch(`/api/360/products?tenant_id=${tenantId}`)
      .then(r => r.json())
      .then(d => setProducts(d.products ?? []))
      .catch(() => {})
  }, [tenantId])

  // Load packages
  const loadPackages = useCallback(async () => {
    if (!tenantId) return
    setLoadingPkgs(true)
    try {
      const r    = await fetch(`/api/360/packages?tenant_id=${tenantId}`)
      const data = await r.json()
      setPackages(data.packages ?? [])
    } finally {
      setLoadingPkgs(false)
    }
  }, [tenantId])

  useEffect(() => { loadPackages() }, [loadPackages])

  return (
    <div className="space-y-5">
      <ToastStack toasts={toasts} />

      {/* Tenant selector (owner only) */}
      {isOwner && tenants.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-xs font-medium text-zinc-400 shrink-0">Business:</label>
          <select
            value={tenantId}
            onChange={e => setTenantId(e.target.value)}
            className="flex-1 max-w-xs rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-fuchsia-500 focus:outline-none"
          >
            {tenants.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Header row */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white/70">
          {loadingPkgs ? 'Loading…' : `${packages.length} package${packages.length !== 1 ? 's' : ''}`}
        </h2>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-2 text-sm font-semibold text-white hover:bg-fuchsia-500 transition-colors"
        >
          <Plus size={14} /> New Package
        </button>
      </div>

      {/* Package list */}
      {loadingPkgs ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-8">
          <Loader2 size={16} className="animate-spin" /> Loading packages…
        </div>
      ) : packages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-4 rounded-2xl border border-dashed border-zinc-800 text-zinc-500">
          <Rotate3D size={40} strokeWidth={1} />
          <div className="text-center">
            <p className="text-sm font-medium text-zinc-400">No 360° packages yet</p>
            <p className="text-xs mt-1">Create your first package to get started.</p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-xl bg-fuchsia-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-fuchsia-500 transition-colors"
          >
            <Plus size={14} /> Create Package
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => (
            <PackageCard
              key={pkg.id}
              pkg={pkg}
              tenantId={tenantId}
              products={products}
              onRefresh={loadPackages}
              toast={toast}
            />
          ))}
        </div>
      )}

      {/* How it works */}
      <details className="rounded-xl border border-zinc-800 bg-zinc-900/30">
        <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors select-none">
          How to create a 360° viewer →
        </summary>
        <ol className="px-4 pb-4 pt-2 space-y-2">
          {[
            'Click "New Package" and select a product',
            'Add a detailed product description',
            'Choose 12, 24, or 36 frames',
            'Upload frames manually OR click "Generate with AI" (requires IMAGINE_API_TOKEN)',
            'Once all frames are uploaded/generated, attach the package to a product',
            'Add the "360 Product Viewer" block to any page in Website Builder',
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-xs text-white/50">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-fuchsia-900/50 text-fuchsia-400 font-bold text-[10px] mt-0.5">{i + 1}</span>
              {step}
            </li>
          ))}
        </ol>
      </details>

      {/* Create modal */}
      {showCreate && (
        <CreatePackageModal
          tenantId={tenantId}
          products={products}
          toast={toast}
          onClose={() => setShowCreate(false)}
          onCreated={pkg => {
            setPackages(prev => [pkg, ...prev])
          }}
        />
      )}
    </div>
  )
}
