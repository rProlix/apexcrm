'use client'
// components/product-360/Product360StudioClient.tsx
// Main admin dashboard for the 360 Product Studio module.

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Rotate3D, Plus, Trash2, Pencil, Zap, Upload, Eye, EyeOff,
  Star, StarOff, RefreshCw, AlertCircle, CheckCircle2,
  ChevronDown, X, Loader2, Settings2, Image as ImageIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import Product360ViewerClient from './Product360ViewerClient'
import type { P360Package, P360Frame, P360PackageSummary } from '@/lib/product-360/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product { id: string; name: string }
interface Tenant  { id: string; name: string; slug: string }

interface Props {
  userRole:         string
  defaultTenantId:  string
  tenants:          Tenant[]
  moduleEnabled:    boolean
}

// ─── Status helpers ───────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft:      'text-white/40 bg-white/4 border-white/8',
  queued:     'text-sky-400 bg-sky-400/10 border-sky-400/20',
  generating: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
  ready:      'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  failed:     'text-red-400 bg-red-400/10 border-red-400/20',
  archived:   'text-white/20 bg-white/3 border-white/5',
}

const STATUS_LABELS: Record<string, string> = {
  draft:      'Draft',
  queued:     'Queued',
  generating: 'Generating…',
  ready:      'Ready',
  failed:     'Failed',
  archived:   'Archived',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Product360StudioClient({ userRole, defaultTenantId, tenants, moduleEnabled }: Props) {
  const isOwner = userRole === 'owner'

  const [tenantId,   setTenantId]   = useState(defaultTenantId)
  const [products,   setProducts]   = useState<Product[]>([])
  const [packages,   setPackages]   = useState<P360PackageSummary[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  // Preview
  const [previewPkg,    setPreviewPkg]    = useState<(P360Package & { frames: P360Frame[] }) | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  // Create modal
  const [showCreate,    setShowCreate]    = useState(false)
  const [createProduct, setCreateProduct] = useState('')
  const [createName,    setCreateName]    = useState('')
  const [createDesc,    setCreateDesc]    = useState('')
  const [createPrompt,  setCreatePrompt]  = useState('')
  const [createType,    setCreateType]    = useState<'ai_generated' | 'uploaded_frames'>('ai_generated')
  const [createFrames,  setCreateFrames]  = useState(36)
  const [creating,      setCreating]      = useState(false)
  const [createError,   setCreateError]   = useState<string | null>(null)

  // Upload
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadFrameIdx, setUploadFrameIdx] = useState(0)

  // Generating
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchData = useCallback(async (tid: string) => {
    setLoading(true)
    setError(null)
    try {
      const [pkgsRes, prodsRes] = await Promise.all([
        fetch(`/api/product-360/packages?tenantId=${tid}`),
        fetch(`/api/product-360/packages?tenantId=${tid}`).then(() =>
          fetch(`/api/builder/product-360/packages?tenantId=${tid}`)
        ),
      ])
      const pkgsJson  = await pkgsRes.json()
      const prodsJson = await prodsRes.json()
      setPackages(pkgsJson.packages ?? [])
      setProducts(prodsJson.products  ?? [])
    } catch {
      setError('Failed to load data. Please refresh.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tenantId) fetchData(tenantId)
  }, [tenantId, fetchData])

  // ── Generation polling ───────────────────────────────────────────────────

  useEffect(() => {
    const inProgress = packages.filter(p => p.status === 'generating' || p.status === 'queued')
    if (!inProgress.length) return

    const timer = setInterval(async () => {
      for (const pkg of inProgress) {
        const res = await fetch(`/api/product-360/packages/${pkg.id}/generation-status?tenantId=${tenantId}`)
        if (res.ok) {
          const data = await res.json()
          setPackages(prev => prev.map(p =>
            p.id === pkg.id
              ? { ...p, status: data.status, frames_done: data.framesCompleted, generation_error: data.error }
              : p
          ))
        }
      }
    }, 8000)

    return () => clearInterval(timer)
  }, [packages, tenantId])

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!createProduct || !createName.trim()) {
      setCreateError('Product and name are required.')
      return
    }
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/product-360/packages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId:         tenantId,
          productId:        createProduct,
          name:             createName.trim(),
          description:      createDesc.trim() || undefined,
          packageType:      createType,
          generationPrompt: createPrompt.trim() || undefined,
          targetFrameCount: createFrames,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setCreateError(json.error ?? 'Failed to create'); return }

      setPackages(prev => [{ ...json.package, frames_done: 0, product_name: products.find(p => p.id === createProduct)?.name ?? null }, ...prev])
      setShowCreate(false)
      resetCreateForm()
    } catch {
      setCreateError('Network error. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  function resetCreateForm() {
    setCreateProduct(''); setCreateName(''); setCreateDesc('')
    setCreatePrompt(''); setCreateType('ai_generated'); setCreateFrames(36)
    setCreateError(null)
  }

  async function handleGenerate(pkgId: string) {
    setGeneratingId(pkgId)
    try {
      const res  = await fetch(`/api/product-360/packages/${pkgId}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, status: 'failed' as const, generation_error: json.error } : p))
        return
      }
      setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, status: 'queued' as const } : p))
    } finally {
      setGeneratingId(null)
    }
  }

  async function handleToggleEnabled(pkg: P360PackageSummary) {
    const newVal = !pkg.is_enabled
    setPackages(prev => prev.map(p => p.id === pkg.id ? { ...p, is_enabled: newVal } : p))
    await fetch(`/api/product-360/packages/${pkg.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_enabled: newVal }),
    })
  }

  async function handleSetDefault(pkg: P360PackageSummary) {
    const newVal = !pkg.is_default
    setPackages(prev => prev.map(p => ({
      ...p,
      is_default: p.id === pkg.id ? newVal : (p.product_id === pkg.product_id ? false : p.is_default),
    })))
    await fetch(`/api/product-360/packages/${pkg.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ is_default: newVal }),
    })
  }

  async function handleArchive(pkg: P360PackageSummary) {
    if (!confirm(`Archive "${pkg.name}"? This will disable it and clean up storage.`)) return
    setPackages(prev => prev.filter(p => p.id !== pkg.id))
    await fetch(`/api/product-360/packages/${pkg.id}?tenantId=${tenantId}`, { method: 'DELETE' })
  }

  async function handlePreview(pkgId: string) {
    setPreviewLoading(true)
    try {
      const res  = await fetch(`/api/product-360/packages/${pkgId}?tenantId=${tenantId}`)
      const json = await res.json()
      if (res.ok) setPreviewPkg(json.package)
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const pkgId = uploadingFor
    if (!pkgId || !e.target.files?.length) return
    const file = e.target.files[0]

    const fd = new FormData()
    fd.append('file', file)
    fd.append('frameIndex',   String(uploadFrameIdx))
    fd.append('angleDegrees', String(Math.round((360 / 36) * uploadFrameIdx)))

    const res  = await fetch(`/api/product-360/packages/${pkgId}/frames?tenantId=${tenantId}`, { method: 'POST', body: fd })
    const json = await res.json()
    if (res.ok) {
      setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, frames_done: (p.frames_done ?? 0) + 1 } : p))
      setUploadFrameIdx(i => i + 1)
    } else {
      alert(json.error ?? 'Upload failed')
    }
    e.target.value = ''
  }

  // ── Module disabled state ─────────────────────────────────────────────────

  if (!moduleEnabled && !isOwner) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center space-y-4">
        <div className="h-16 w-16 rounded-2xl bg-fuchsia-400/10 border border-fuchsia-400/20 flex items-center justify-center">
          <Rotate3D className="h-8 w-8 text-fuchsia-400/40" />
        </div>
        <h2 className="text-lg font-semibold text-white">360 Product Studio</h2>
        <p className="text-sm text-white/40 max-w-sm">
          This module is not enabled for your account. Contact your owner to enable it.
        </p>
      </div>
    )
  }

  // ── Main UI ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-fuchsia-400/10 border border-fuchsia-400/20 flex items-center justify-center">
            <Rotate3D className="h-5 w-5 text-fuchsia-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">360 Product Studio</h1>
            <p className="text-xs text-white/40">
              {packages.length} package{packages.length !== 1 ? 's' : ''} across {products.length} product{products.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Owner tenant selector */}
          {isOwner && tenants.length > 0 && (
            <div className="relative">
              <select
                value={tenantId}
                onChange={e => setTenantId(e.target.value)}
                className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-white/6 border border-white/10 text-white text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400/40"
              >
                {tenants.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40 pointer-events-none" />
            </div>
          )}
          <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            New Package
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Two-column layout: packages list + preview */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        {/* Package list */}
        <div className="xl:col-span-3 space-y-3">
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/4 border border-white/8 animate-pulse" />
            ))
          ) : packages.length === 0 ? (
            <PackageEmptyState onAdd={() => setShowCreate(true)} />
          ) : (
            packages.map(pkg => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onGenerate={handleGenerate}
                onToggleEnabled={handleToggleEnabled}
                onSetDefault={handleSetDefault}
                onArchive={handleArchive}
                onPreview={handlePreview}
                onUpload={pkgId => { setUploadingFor(pkgId); setUploadFrameIdx(0); fileInputRef.current?.click() }}
                generatingId={generatingId}
                previewLoading={previewLoading}
              />
            ))
          )}
        </div>

        {/* Preview pane */}
        <div className="xl:col-span-2">
          <div className="sticky top-4">
            {previewPkg ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-white/60">Preview: {previewPkg.name}</p>
                  <button onClick={() => setPreviewPkg(null)} className="text-white/30 hover:text-white transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {previewPkg.frames?.length ? (
                  <Product360ViewerClient
                    frames={previewPkg.frames}
                    viewerSettings={{ autoRotate: false, showControls: true }}
                    packageName={previewPkg.name}
                    showLabel
                    className="rounded-2xl"
                  />
                ) : (
                  <div className="aspect-square rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                    <p className="text-xs text-white/30">No frames yet</p>
                  </div>
                )}
                <PackageDetailInfo pkg={previewPkg} />
              </div>
            ) : (
              <div className="aspect-square rounded-2xl bg-white/4 border border-white/8 flex flex-col items-center justify-center gap-3 text-center p-6">
                <Eye className="h-8 w-8 text-white/20" />
                <p className="text-xs text-white/30">Click Preview on a package to see it here</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input for frame upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Create package modal */}
      {showCreate && (
        <CreatePackageModal
          products={products}
          creating={creating}
          createError={createError}
          createProduct={createProduct}  setCreateProduct={setCreateProduct}
          createName={createName}        setCreateName={setCreateName}
          createDesc={createDesc}        setCreateDesc={setCreateDesc}
          createPrompt={createPrompt}    setCreatePrompt={setCreatePrompt}
          createType={createType}        setCreateType={setCreateType}
          createFrames={createFrames}    setCreateFrames={setCreateFrames}
          onSubmit={handleCreate}
          onClose={() => { setShowCreate(false); resetCreateForm() }}
        />
      )}
    </div>
  )
}

// ─── Package Card ─────────────────────────────────────────────────────────────

interface PackageCardProps {
  pkg:             P360PackageSummary
  onGenerate:      (id: string) => void
  onToggleEnabled: (pkg: P360PackageSummary) => void
  onSetDefault:    (pkg: P360PackageSummary) => void
  onArchive:       (pkg: P360PackageSummary) => void
  onPreview:       (id: string) => void
  onUpload:        (id: string) => void
  generatingId:    string | null
  previewLoading:  boolean
}

function PackageCard({
  pkg, onGenerate, onToggleEnabled, onSetDefault,
  onArchive, onPreview, onUpload, generatingId, previewLoading,
}: PackageCardProps) {
  const progressPct = pkg.target_frame_count > 0
    ? Math.min(100, Math.round((pkg.frames_done / pkg.target_frame_count) * 100))
    : 0
  const isGenerating = pkg.status === 'generating' || pkg.status === 'queued'
  const canGenerate  = pkg.package_type === 'ai_generated' || pkg.package_type === 'hybrid'

  return (
    <div className="premium-panel premium-border rounded-2xl p-4 space-y-3">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[pkg.status] ?? STATUS_STYLES.draft}`}>
              {isGenerating && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
              {STATUS_LABELS[pkg.status] ?? pkg.status}
            </span>
            {pkg.is_default  && <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">Default</span>}
            {pkg.is_enabled  && pkg.status === 'ready' && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">Public</span>}
          </div>
          <h3 className="text-sm font-semibold text-white truncate">{pkg.name}</h3>
          {pkg.product_name && <p className="text-xs text-white/30 truncate">{pkg.product_name}</p>}
        </div>

        {/* Cover thumb */}
        {pkg.cover_frame_url && (
          <div className="h-12 w-12 rounded-lg overflow-hidden border border-white/8 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pkg.cover_frame_url} alt={pkg.name} className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* Progress bar */}
      {pkg.target_frame_count > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/40">
              {pkg.frames_done} / {pkg.target_frame_count} frames
            </span>
            <span className="text-[10px] text-white/40">{progressPct}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pkg.status === 'ready' ? 'bg-emerald-400' : 'bg-fuchsia-400'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error message */}
      {pkg.generation_error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/8 border border-red-500/15 px-3 py-2">
          <AlertCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-400 line-clamp-2">{pkg.generation_error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Preview */}
        <button
          onClick={() => onPreview(pkg.id)}
          disabled={previewLoading}
          className="h-7 px-2.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/8 transition-colors flex items-center gap-1"
        >
          <Eye className="h-3 w-3" />
          Preview
        </button>

        {/* Generate / Retry */}
        {canGenerate && (pkg.status === 'draft' || pkg.status === 'failed') && (
          <button
            onClick={() => onGenerate(pkg.id)}
            disabled={generatingId === pkg.id}
            className="h-7 px-2.5 rounded-lg text-xs text-fuchsia-400 hover:text-fuchsia-300 hover:bg-fuchsia-400/8 transition-colors flex items-center gap-1 border border-fuchsia-400/20"
          >
            {generatingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {pkg.status === 'failed' ? 'Retry' : 'Generate'}
          </button>
        )}

        {/* Manual upload */}
        <button
          onClick={() => onUpload(pkg.id)}
          className="h-7 px-2.5 rounded-lg text-xs text-white/50 hover:text-white hover:bg-white/8 transition-colors flex items-center gap-1"
        >
          <Upload className="h-3 w-3" />
          Upload
        </button>

        {/* Enable/disable (only for ready packages) */}
        {pkg.status === 'ready' && (
          <button
            onClick={() => onToggleEnabled(pkg)}
            className={`h-7 px-2.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
              pkg.is_enabled
                ? 'text-emerald-400 bg-emerald-400/8 border border-emerald-400/20 hover:bg-emerald-400/15'
                : 'text-white/40 hover:text-white hover:bg-white/8'
            }`}
          >
            {pkg.is_enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            {pkg.is_enabled ? 'Enabled' : 'Disabled'}
          </button>
        )}

        {/* Default toggle */}
        {pkg.status === 'ready' && (
          <button
            onClick={() => onSetDefault(pkg)}
            className={`h-7 px-2.5 rounded-lg text-xs transition-colors flex items-center gap-1 ${
              pkg.is_default
                ? 'text-amber-400 bg-amber-400/8 border border-amber-400/20'
                : 'text-white/40 hover:text-amber-400 hover:bg-amber-400/8'
            }`}
          >
            {pkg.is_default ? <Star className="h-3 w-3 fill-current" /> : <StarOff className="h-3 w-3" />}
            Default
          </button>
        )}

        {/* Delete */}
        <button
          onClick={() => onArchive(pkg)}
          className="ml-auto h-7 w-7 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/8 transition-colors flex items-center justify-center"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

// ─── Package detail info ──────────────────────────────────────────────────────

function PackageDetailInfo({ pkg }: { pkg: P360Package }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/6 p-3 space-y-1.5">
      <InfoRow label="Type"   value={pkg.package_type.replace('_', ' ')} />
      <InfoRow label="Frames" value={`${pkg.frame_count} / ${pkg.target_frame_count}`} />
      {pkg.generation_prompt && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Prompt</p>
          <p className="text-xs text-white/50 line-clamp-3">{pkg.generation_prompt}</p>
        </div>
      )}
      {pkg.promo_starts_at && (
        <InfoRow label="Promo start" value={new Date(pkg.promo_starts_at).toLocaleDateString()} />
      )}
      {pkg.promo_ends_at && (
        <InfoRow label="Promo end" value={new Date(pkg.promo_ends_at).toLocaleDateString()} />
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-white/30 uppercase tracking-wider">{label}</span>
      <span className="text-xs text-white/60 capitalize">{value}</span>
    </div>
  )
}

// ─── Create Package Modal ─────────────────────────────────────────────────────

interface CreatePackageModalProps {
  products:         Product[]
  creating:         boolean
  createError:      string | null
  createProduct:    string;  setCreateProduct:  (v: string)  => void
  createName:       string;  setCreateName:     (v: string)  => void
  createDesc:       string;  setCreateDesc:     (v: string)  => void
  createPrompt:     string;  setCreatePrompt:   (v: string)  => void
  createType:       'ai_generated' | 'uploaded_frames'
  setCreateType:    (v: 'ai_generated' | 'uploaded_frames') => void
  createFrames:     number;  setCreateFrames:   (v: number)  => void
  onSubmit:         () => void
  onClose:          () => void
}

function CreatePackageModal({
  products, creating, createError,
  createProduct, setCreateProduct,
  createName,    setCreateName,
  createDesc,    setCreateDesc,
  createPrompt,  setCreatePrompt,
  createType,    setCreateType,
  createFrames,  setCreateFrames,
  onSubmit, onClose,
}: CreatePackageModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg premium-panel premium-border rounded-2xl p-6 shadow-panel-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-white">New 360° Package</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {createError && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400">
            {createError}
          </div>
        )}

        <div className="space-y-4">
          {/* Product */}
          <Field label="Product">
            <select
              value={createProduct}
              onChange={e => setCreateProduct(e.target.value)}
              className="store-input"
            >
              <option value="">Select a product…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          {/* Package name */}
          <Field label="Package Name">
            <input
              type="text"
              value={createName}
              onChange={e => setCreateName(e.target.value)}
              placeholder="e.g. Standard View, Summer Promo…"
              className="store-input"
            />
          </Field>

          {/* Description */}
          <Field label="Description (optional)">
            <textarea
              value={createDesc}
              onChange={e => setCreateDesc(e.target.value)}
              placeholder="Brief description of this package…"
              rows={2}
              className="store-input resize-none"
            />
          </Field>

          {/* Source type */}
          <Field label="Frame Source">
            <div className="grid grid-cols-2 gap-2">
              {(['ai_generated', 'uploaded_frames'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setCreateType(t)}
                  className={`h-10 rounded-xl text-xs font-medium border transition-colors ${
                    createType === t
                      ? 'bg-fuchsia-400/10 border-fuchsia-400/30 text-fuchsia-400'
                      : 'bg-white/4 border-white/8 text-white/40 hover:text-white hover:bg-white/8'
                  }`}
                >
                  {t === 'ai_generated' ? '⚡ AI Generated' : '📁 Manual Upload'}
                </button>
              ))}
            </div>
          </Field>

          {/* Frame count */}
          <Field label="Target Frame Count">
            <div className="grid grid-cols-3 gap-2">
              {[12, 24, 36].map(n => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCreateFrames(n)}
                  className={`h-9 rounded-xl text-xs font-medium border transition-colors ${
                    createFrames === n
                      ? 'bg-fuchsia-400/10 border-fuchsia-400/30 text-fuchsia-400'
                      : 'bg-white/4 border-white/8 text-white/40 hover:text-white hover:bg-white/8'
                  }`}
                >
                  {n} frames
                </button>
              ))}
            </div>
          </Field>

          {/* AI prompt (only for AI type) */}
          {createType === 'ai_generated' && (
            <Field label="Product Description / AI Prompt">
              <textarea
                value={createPrompt}
                onChange={e => setCreatePrompt(e.target.value)}
                placeholder="Describe the product for AI generation. e.g. Ceramic coffee mug with matte white finish and gold logo, on wooden table…"
                rows={4}
                className="store-input resize-none"
              />
              <p className="text-xs text-white/30 mt-1">
                The more detail you provide, the more consistent the 360° frames will be.
              </p>
            </Field>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={creating}>
            Cancel
          </Button>
          <Button variant="primary" className="flex-1" onClick={onSubmit} loading={creating}>
            Create Package
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── Field helper ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-white/50 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function PackageEmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-white/6 border-dashed">
      <div className="h-14 w-14 rounded-2xl bg-fuchsia-400/10 border border-fuchsia-400/20 flex items-center justify-center mb-3">
        <Rotate3D className="h-7 w-7 text-fuchsia-400/60" />
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">No 360° packages yet</h3>
      <p className="text-xs text-white/30 mb-4 max-w-xs">
        Create your first 360° package to give customers an interactive product view.
      </p>
      <Button variant="primary" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Create Package
      </Button>
    </div>
  )
}
