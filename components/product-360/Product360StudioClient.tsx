'use client'
// components/product-360/Product360StudioClient.tsx
// Full 360 Product Studio dashboard — product browser, package manager, preset editor.

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Rotate3D, Plus, Trash2, Zap, Upload, Eye, EyeOff,
  Star, StarOff, RefreshCw, AlertCircle, X, Loader2,
  Search, Package, ChevronDown, Copy, Archive,
  SlidersHorizontal, ChevronRight, Image as ImageIcon,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import Product360ViewerClient from './Product360ViewerClient'
import type { P360Package, P360Frame, P360PackageSummary, P360StoreProduct } from '@/lib/product-360/types'
import {
  LIGHTING_PRESETS, BACKGROUND_PRESETS, CAMERA_PRESETS,
  CATEGORY_PRESETS, FRAME_COUNT_OPTIONS, TURN_DIRECTION_OPTIONS,
} from '@/lib/product-360/presets'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant  { id: string; name: string; slug: string }

interface Props {
  userRole:        string
  defaultTenantId: string
  tenants:         Tenant[]
  moduleEnabled:   boolean
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
  draft: 'Draft', queued: 'Queued', generating: 'Generating…',
  ready: 'Ready', failed: 'Failed', archived: 'Archived',
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Product360StudioClient({ userRole, defaultTenantId, tenants, moduleEnabled }: Props) {
  const isOwner = userRole === 'owner'

  // Tenant
  const [tenantId, setTenantId] = useState(defaultTenantId)

  // Products
  const [products,    setProducts]    = useState<P360StoreProduct[]>([])
  const [prodSearch,  setProdSearch]  = useState('')
  const [prodTotal,   setProdTotal]   = useState(0)
  const [prodPage,    setProdPage]    = useState(1)
  const [prodLoading, setProdLoading] = useState(false)
  const [prodError,   setProdError]   = useState<string | null>(null)
  const [selectedProd, setSelectedProd] = useState<P360StoreProduct | null>(null)

  // Packages
  const [packages,   setPackages]   = useState<P360PackageSummary[]>([])
  const [pkgLoading, setPkgLoading] = useState(false)
  const [pkgError,   setPkgError]   = useState<string | null>(null)

  // Preview
  const [previewPkg,      setPreviewPkg]      = useState<(P360Package & { frames: P360Frame[] }) | null>(null)
  const [previewLoading,  setPreviewLoading]  = useState(false)

  // Actions
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const fileInputRef   = useRef<HTMLInputElement>(null)
  const [uploadingFor, setUploadingFor] = useState<string | null>(null)
  const [uploadIdx,    setUploadIdx]    = useState(0)

  // Modals
  const [showCreate,   setShowCreate]   = useState(false)
  const [showDuplicate, setShowDuplicate] = useState<P360PackageSummary | null>(null)
  const [dupName,      setDupName]      = useState('')
  const [dupLoading,   setDupLoading]   = useState(false)

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchProducts = useCallback(async (tid: string, search: string, page: number) => {
    setProdLoading(true)
    setProdError(null)
    try {
      const qs = new URLSearchParams({ tenantId: tid, page: String(page), limit: '20' })
      if (search.trim()) qs.set('search', search.trim())
      const res  = await fetch(`/api/product-360/products?${qs}`)
      const json = await res.json()
      if (res.ok) {
        setProducts(json.products ?? [])
        setProdTotal(json.total ?? 0)
      } else {
        setProdError(json.error ?? 'Failed to load products')
        setProducts([])
      }
    } catch {
      setProdError('Network error — could not reach the server')
      setProducts([])
    } finally {
      setProdLoading(false)
    }
  }, [])

  const fetchPackages = useCallback(async (tid: string, productId?: string) => {
    setPkgLoading(true)
    setPkgError(null)
    try {
      const qs = new URLSearchParams({ tenantId: tid })
      if (productId) qs.set('productId', productId)
      const res  = await fetch(`/api/product-360/packages?${qs}`)
      const json = await res.json()
      if (res.ok) setPackages(json.packages ?? [])
      else setPkgError(json.error ?? 'Failed to load packages')
    } catch {
      setPkgError('Network error')
    } finally {
      setPkgLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tenantId) {
      fetchProducts(tenantId, prodSearch, prodPage)
      fetchPackages(tenantId, selectedProd?.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => {
      if (tenantId) { setProdPage(1); fetchProducts(tenantId, prodSearch, 1) }
    }, 400)
    return () => clearTimeout(t)
  }, [prodSearch, tenantId, fetchProducts])

  // ── Generation polling ────────────────────────────────────────────────────

  useEffect(() => {
    const inProgress = packages.filter(p => p.status === 'generating' || p.status === 'queued')
    if (!inProgress.length) return
    const timer = setInterval(async () => {
      for (const pkg of inProgress) {
        const res  = await fetch(`/api/product-360/packages/${pkg.id}/generation-status?tenantId=${tenantId}`)
        if (res.ok) {
          const d = await res.json()
          setPackages(prev => prev.map(p =>
            p.id === pkg.id
              ? { ...p, status: d.status, frames_done: d.framesCompleted ?? p.frames_done, generation_error: d.error }
              : p,
          ))
        }
      }
    }, 8_000)
    return () => clearInterval(timer)
  }, [packages, tenantId])

  // ── Product select ────────────────────────────────────────────────────────

  function handleSelectProduct(prod: P360StoreProduct) {
    setSelectedProd(prod)
    setPreviewPkg(null)
    fetchPackages(tenantId, prod.id)
  }

  function handleClearProduct() {
    setSelectedProd(null)
    setPreviewPkg(null)
    fetchPackages(tenantId)
  }

  // ── Actions ───────────────────────────────────────────────────────────────

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
        setPackages(prev => prev.map(p =>
          p.id === pkgId ? { ...p, status: 'failed' as const, generation_error: json.error } : p,
        ))
        return
      }
      setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, status: 'queued' as const } : p))
    } finally {
      setGeneratingId(null)
    }
  }

  async function handleRegenerate(pkgId: string) {
    if (!confirm('Regenerate all frames? This will overwrite existing frames.')) return
    setGeneratingId(pkgId)
    try {
      await fetch(`/api/product-360/packages/${pkgId}/regenerate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId }),
      })
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
    if (!confirm(`Archive "${pkg.name}"? This will disable the package.`)) return
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

  async function handleDuplicate() {
    if (!showDuplicate || !dupName.trim()) return
    setDupLoading(true)
    try {
      const res  = await fetch(`/api/product-360/packages/${showDuplicate.id}/duplicate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId, name: dupName.trim() }),
      })
      const json = await res.json()
      if (res.ok) {
        const prod = products.find(p => p.id === json.package.product_id)
        setPackages(prev => [{ ...json.package, frames_done: 0, product_name: prod?.name ?? showDuplicate.product_name }, ...prev])
      }
    } finally {
      setDupLoading(false)
      setShowDuplicate(null)
      setDupName('')
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const pkgId = uploadingFor
    if (!pkgId || !e.target.files?.length) return
    const file = e.target.files[0]
    const fd   = new FormData()
    fd.append('file', file)
    fd.append('frameIndex',   String(uploadIdx))
    fd.append('angleDegrees', String(Math.round((360 / 36) * uploadIdx)))
    const res  = await fetch(`/api/product-360/packages/${pkgId}/frames?tenantId=${tenantId}`, { method: 'POST', body: fd })
    const json = await res.json()
    if (res.ok) {
      setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, frames_done: (p.frames_done ?? 0) + 1 } : p))
      setUploadIdx(i => i + 1)
    } else {
      alert(json.error ?? 'Upload failed')
    }
    e.target.value = ''
  }

  // ── Module disabled ───────────────────────────────────────────────────────

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

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-fuchsia-400/10 border border-fuchsia-400/20 flex items-center justify-center shrink-0">
            <Rotate3D className="h-5 w-5 text-fuchsia-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">360 Product Studio</h1>
            <p className="text-xs text-white/40">
              {packages.length} package{packages.length !== 1 ? 's' : ''} · Gemini AI generation
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && tenants.length > 0 && (
            <div className="relative">
              <select
                value={tenantId}
                onChange={e => { setTenantId(e.target.value); setSelectedProd(null) }}
                className="appearance-none h-9 pl-3 pr-8 rounded-xl bg-white/6 border border-white/10 text-white text-xs focus:outline-none focus:ring-1 focus:ring-fuchsia-400/40"
              >
                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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

      {/* ── Three-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

        {/* LEFT: Product browser */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">Products</h2>
            {selectedProd && (
              <button onClick={handleClearProduct} className="text-[10px] text-white/30 hover:text-white transition-colors">
                Show all
              </button>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" />
            <input
              type="text"
              value={prodSearch}
              onChange={e => setProdSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/5 border border-white/8 text-xs text-white placeholder-white/30 focus:outline-none focus:border-fuchsia-400/40 focus:ring-1 focus:ring-fuchsia-400/20"
            />
          </div>

          {/* Product list */}
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto scrollbar-thin">
            {prodLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-white/4 animate-pulse" />
              ))
            ) : prodError ? (
              <div className="py-8 text-center px-2">
                <AlertCircle className="h-5 w-5 text-red-400 mx-auto mb-2" />
                <p className="text-xs text-red-400 mb-3">{prodError}</p>
                <button
                  onClick={() => tenantId && fetchProducts(tenantId, prodSearch, prodPage)}
                  className="text-[10px] text-fuchsia-400 hover:text-fuchsia-300 underline"
                >
                  Retry
                </button>
              </div>
            ) : products.length === 0 ? (
              <div className="py-10 text-center">
                <Package className="h-6 w-6 text-white/20 mx-auto mb-2" />
                <p className="text-xs text-white/30">
                  {prodSearch ? 'No matching products' : 'No products in store yet'}
                </p>
              </div>
            ) : (
              products.map(prod => (
                <button
                  key={prod.id}
                  onClick={() => handleSelectProduct(prod)}
                  className={`w-full text-left rounded-xl p-2.5 transition-all border ${
                    selectedProd?.id === prod.id
                      ? 'bg-fuchsia-400/10 border-fuchsia-400/30'
                      : 'bg-white/3 border-white/6 hover:bg-white/6 hover:border-white/12'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    {prod.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={prod.image_url} alt={prod.name}
                        className="h-9 w-9 rounded-lg object-cover border border-white/8 shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-lg bg-white/6 border border-white/8 flex items-center justify-center shrink-0">
                        <ImageIcon className="h-4 w-4 text-white/20" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{prod.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {prod.price !== null && (
                          <span className="text-[10px] text-white/30">
                            {prod.currency ?? '$'}{prod.price}
                          </span>
                        )}
                        {prod.has_active_360 && (
                          <span className="text-[10px] text-emerald-400/80 bg-emerald-400/10 px-1 rounded">360°</span>
                        )}
                        {prod.package_count > 0 && (
                          <span className="text-[10px] text-white/30">{prod.package_count} pkg</span>
                        )}
                      </div>
                    </div>
                    {selectedProd?.id === prod.id && (
                      <Check className="h-3.5 w-3.5 text-fuchsia-400 shrink-0" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Pagination */}
          {prodTotal > 20 && (
            <div className="flex items-center justify-between">
              <button
                onClick={() => { setProdPage(p => Math.max(1, p - 1)); fetchProducts(tenantId, prodSearch, prodPage - 1) }}
                disabled={prodPage === 1}
                className="text-xs text-white/30 hover:text-white disabled:opacity-30 transition-colors"
              >← Prev</button>
              <span className="text-[10px] text-white/30">{prodPage} / {Math.ceil(prodTotal / 20)}</span>
              <button
                onClick={() => { setProdPage(p => p + 1); fetchProducts(tenantId, prodSearch, prodPage + 1) }}
                disabled={prodPage >= Math.ceil(prodTotal / 20)}
                className="text-xs text-white/30 hover:text-white disabled:opacity-30 transition-colors"
              >Next →</button>
            </div>
          )}
        </div>

        {/* CENTER: Package list */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
              {selectedProd ? `Packages for ${selectedProd.name}` : 'All Packages'}
            </h2>
            <span className="text-[10px] text-white/30">{packages.length} total</span>
          </div>

          {pkgError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{pkgError}</p>
            </div>
          )}

          {pkgLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-white/4 border border-white/8 animate-pulse" />
            ))
          ) : packages.length === 0 ? (
            <PackageEmptyState
              hasProduct={!!selectedProd}
              onAdd={() => setShowCreate(true)}
            />
          ) : (
            packages.map(pkg => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onGenerate={handleGenerate}
                onRegenerate={handleRegenerate}
                onToggleEnabled={handleToggleEnabled}
                onSetDefault={handleSetDefault}
                onArchive={handleArchive}
                onPreview={handlePreview}
                onDuplicate={p => { setShowDuplicate(p); setDupName(`${p.name} (Copy)`) }}
                onUpload={pkgId => { setUploadingFor(pkgId); setUploadIdx(0); fileInputRef.current?.click() }}
                generatingId={generatingId}
                previewLoading={previewLoading}
              />
            ))
          )}
        </div>

        {/* RIGHT: Preview + detail */}
        <div className="lg:col-span-4">
          <div className="sticky top-4 space-y-3">
            {previewPkg ? (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-white/60 truncate">Preview: {previewPkg.name}</p>
                  <button onClick={() => setPreviewPkg(null)} className="text-white/30 hover:text-white transition-colors shrink-0 ml-2">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {(previewPkg.frames?.length ?? 0) > 0 ? (
                  <Product360ViewerClient
                    frames={previewPkg.frames}
                    hotspots={[]}
                    viewerSettings={{ autoRotate: false, showControls: true, enableHotspots: false }}
                    packageName={previewPkg.name}
                    showLabel
                  />
                ) : (
                  <div className="aspect-square rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                    <p className="text-xs text-white/30">No frames yet</p>
                  </div>
                )}
                <PackageDetailInfo pkg={previewPkg} />
              </>
            ) : (
              <div className="aspect-square rounded-2xl bg-white/4 border border-white/8 flex flex-col items-center justify-center gap-3 text-center p-6">
                <Eye className="h-8 w-8 text-white/20" />
                <p className="text-xs text-white/30">
                  Select a product, then click Preview on a package
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Create Package Modal */}
      {showCreate && (
        <CreatePackageModal
          products={selectedProd ? [selectedProd] : products}
          defaultProduct={selectedProd ?? undefined}
          tenantId={tenantId}
          onCreated={pkg => {
            const prod = products.find(p => p.id === pkg.product_id)
            setPackages(prev => [{ ...pkg, frames_done: 0, product_name: prod?.name ?? null }, ...prev])
            setShowCreate(false)
          }}
          onClose={() => setShowCreate(false)}
        />
      )}

      {/* Duplicate Modal */}
      {showDuplicate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm premium-panel premium-border rounded-2xl p-6 shadow-panel-lg">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white">Duplicate Package</h2>
              <button onClick={() => setShowDuplicate(null)} className="text-white/30 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-white/50 mb-4">
              Duplicating <span className="text-white">"{showDuplicate.name}"</span>. Settings will be copied; frames will not.
            </p>
            <input
              type="text"
              value={dupName}
              onChange={e => setDupName(e.target.value)}
              placeholder="New package name…"
              className="store-input w-full mb-4"
              autoFocus
            />
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setShowDuplicate(null)} disabled={dupLoading}>
                Cancel
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleDuplicate} loading={dupLoading}>
                Duplicate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Package Card ──────────────────────────────────────────────────────────────

interface PackageCardProps {
  pkg:             P360PackageSummary
  onGenerate:      (id: string) => void
  onRegenerate:    (id: string) => void
  onToggleEnabled: (pkg: P360PackageSummary) => void
  onSetDefault:    (pkg: P360PackageSummary) => void
  onArchive:       (pkg: P360PackageSummary) => void
  onPreview:       (id: string) => void
  onDuplicate:     (pkg: P360PackageSummary) => void
  onUpload:        (id: string) => void
  generatingId:    string | null
  previewLoading:  boolean
}

function PackageCard({
  pkg, onGenerate, onRegenerate, onToggleEnabled, onSetDefault,
  onArchive, onPreview, onDuplicate, onUpload, generatingId, previewLoading,
}: PackageCardProps) {
  const isGenerating = pkg.status === 'generating' || pkg.status === 'queued'
  const canGenerate  = pkg.package_type === 'ai_generated' || pkg.package_type === 'hybrid'
  const progressPct  = pkg.target_frame_count > 0
    ? Math.min(100, Math.round(((pkg.frames_done ?? 0) / pkg.target_frame_count) * 100))
    : 0

  return (
    <div className="premium-panel premium-border rounded-2xl p-4 space-y-3 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_STYLES[pkg.status] ?? STATUS_STYLES.draft}`}>
              {isGenerating && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
              {STATUS_LABELS[pkg.status] ?? pkg.status}
            </span>
            {pkg.is_default  && <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">Default</span>}
            {pkg.is_enabled  && pkg.status === 'ready' && <span className="text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">Live</span>}
            {pkg.promo_tag   && <span className="text-[10px] text-fuchsia-400 bg-fuchsia-400/10 border border-fuchsia-400/20 px-2 py-0.5 rounded-full">{pkg.promo_tag}</span>}
          </div>
          <h3 className="text-sm font-semibold text-white truncate">{pkg.name}</h3>
          {pkg.product_name && <p className="text-xs text-white/30 truncate">{pkg.product_name}</p>}
          {/* Preset chips */}
          {(pkg.lighting_preset || pkg.background_preset || pkg.camera_preset) && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {pkg.lighting_preset    && <PresetChip label={pkg.lighting_preset.replace(/_/g, ' ')} />}
              {pkg.background_preset  && <PresetChip label={pkg.background_preset.replace(/_/g, ' ')} />}
              {pkg.camera_preset      && <PresetChip label={pkg.camera_preset.replace(/_/g, ' ')} />}
            </div>
          )}
        </div>
        {pkg.cover_frame_url && (
          <div className="h-12 w-12 rounded-lg overflow-hidden border border-white/8 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pkg.cover_frame_url} alt={pkg.name} className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      {/* Progress */}
      {pkg.target_frame_count > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-white/30">
            <span>{pkg.frames_done ?? 0} / {pkg.target_frame_count} frames</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${pkg.status === 'ready' ? 'bg-emerald-400' : 'bg-fuchsia-400'}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {pkg.generation_error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-500/8 border border-red-500/15 px-3 py-2">
          <AlertCircle className="h-3 w-3 text-red-400 mt-0.5 shrink-0" />
          <p className="text-xs text-red-400 line-clamp-2">{pkg.generation_error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 flex-wrap">
        <ActionBtn onClick={() => onPreview(pkg.id)} disabled={previewLoading} icon={<Eye className="h-3 w-3" />} label="Preview" />

        {canGenerate && (pkg.status === 'draft' || pkg.status === 'failed') && (
          <ActionBtn
            onClick={() => onGenerate(pkg.id)}
            disabled={generatingId === pkg.id}
            icon={generatingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            label={pkg.status === 'failed' ? 'Retry' : 'Generate'}
            highlight
          />
        )}

        {canGenerate && pkg.status === 'ready' && (
          <ActionBtn
            onClick={() => onRegenerate(pkg.id)}
            disabled={generatingId === pkg.id}
            icon={<RefreshCw className="h-3 w-3" />}
            label="Regen"
          />
        )}

        <ActionBtn onClick={() => onUpload(pkg.id)} icon={<Upload className="h-3 w-3" />} label="Upload" />

        {pkg.status === 'ready' && (
          <ActionBtn
            onClick={() => onToggleEnabled(pkg)}
            icon={pkg.is_enabled ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            label={pkg.is_enabled ? 'Enabled' : 'Disabled'}
            active={pkg.is_enabled}
            activeClass="text-emerald-400 bg-emerald-400/8 border-emerald-400/20"
          />
        )}

        {pkg.status === 'ready' && (
          <ActionBtn
            onClick={() => onSetDefault(pkg)}
            icon={pkg.is_default ? <Star className="h-3 w-3 fill-current" /> : <StarOff className="h-3 w-3" />}
            label="Default"
            active={pkg.is_default}
            activeClass="text-amber-400 bg-amber-400/8 border-amber-400/20"
          />
        )}

        <ActionBtn onClick={() => onDuplicate(pkg)} icon={<Copy className="h-3 w-3" />} label="Duplicate" />

        <button
          onClick={() => onArchive(pkg)}
          className="ml-auto h-7 w-7 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/8 transition-colors flex items-center justify-center"
        >
          <Archive className="h-3 w-3" />
        </button>
      </div>
    </div>
  )
}

function PresetChip({ label }: { label: string }) {
  return (
    <span className="text-[9px] capitalize text-white/30 bg-white/4 border border-white/8 px-1.5 py-0.5 rounded-full">
      {label}
    </span>
  )
}

function ActionBtn({
  onClick, disabled, icon, label, highlight, active, activeClass,
}: {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
  highlight?: boolean
  active?: boolean
  activeClass?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-7 px-2 rounded-lg text-[11px] transition-colors flex items-center gap-1 disabled:opacity-40 border ${
        active && activeClass
          ? activeClass
          : highlight
          ? 'text-fuchsia-400 bg-fuchsia-400/8 border-fuchsia-400/20 hover:bg-fuchsia-400/15'
          : 'text-white/40 border-transparent hover:text-white hover:bg-white/8'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

// ─── Package Detail Info ──────────────────────────────────────────────────────

function PackageDetailInfo({ pkg }: { pkg: P360Package }) {
  return (
    <div className="rounded-xl bg-white/3 border border-white/6 p-3 space-y-1.5 text-[11px]">
      <Row label="AI Model"     value={pkg.ai_model ?? 'gemini-2.5-flash-lite'} />
      <Row label="Type"         value={pkg.package_type.replace(/_/g, ' ')} />
      <Row label="Frames"       value={`${pkg.frame_count} / ${pkg.target_frame_count}`} />
      {pkg.lighting_preset    && <Row label="Lighting"    value={pkg.lighting_preset.replace(/_/g, ' ')} />}
      {pkg.background_preset  && <Row label="Background"  value={pkg.background_preset.replace(/_/g, ' ')} />}
      {pkg.camera_preset      && <Row label="Camera"      value={pkg.camera_preset.replace(/_/g, ' ')} />}
      {pkg.turn_direction     && <Row label="Direction"   value={pkg.turn_direction.replace(/_/g, ' ')} />}
      {pkg.generation_prompt && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Prompt</p>
          <p className="text-white/50 line-clamp-3">{pkg.generation_prompt}</p>
        </div>
      )}
      {pkg.promo_starts_at && <Row label="Promo start" value={new Date(pkg.promo_starts_at).toLocaleDateString()} />}
      {pkg.promo_ends_at   && <Row label="Promo end"   value={new Date(pkg.promo_ends_at).toLocaleDateString()} />}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[10px] text-white/30 uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-white/60 capitalize text-right truncate">{value}</span>
    </div>
  )
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function PackageEmptyState({ hasProduct, onAdd }: { hasProduct: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border border-white/6 border-dashed">
      <div className="h-14 w-14 rounded-2xl bg-fuchsia-400/10 border border-fuchsia-400/20 flex items-center justify-center mb-3">
        <Rotate3D className="h-7 w-7 text-fuchsia-400/60" />
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">
        {hasProduct ? 'No packages for this product' : 'No 360° packages yet'}
      </h3>
      <p className="text-xs text-white/30 mb-4 max-w-xs">
        {hasProduct
          ? 'Create a 360° package to give customers an interactive spin view for this product.'
          : 'Select a product from the left, then create a 360° package.'}
      </p>
      <Button variant="primary" size="sm" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Create Package
      </Button>
    </div>
  )
}

// ─── Create Package Modal ─────────────────────────────────────────────────────

interface CreatePackageModalProps {
  products:        P360StoreProduct[]
  defaultProduct?: P360StoreProduct
  tenantId:        string
  onCreated:       (pkg: P360PackageSummary) => void
  onClose:         () => void
}

function CreatePackageModal({ products, defaultProduct, tenantId, onCreated, onClose }: CreatePackageModalProps) {
  const [product,    setProduct]    = useState(defaultProduct?.id ?? '')
  const [name,       setName]       = useState('')
  const [desc,       setDesc]       = useState('')
  const [prompt,     setPrompt]     = useState('')
  const [notes,      setNotes]      = useState('')
  const [type,       setType]       = useState<'ai_generated' | 'uploaded_frames'>('ai_generated')
  const [frames,     setFrames]     = useState(36)
  const [lighting,   setLighting]   = useState('')
  const [background, setBackground] = useState('')
  const [category,   setCategory]   = useState('')
  const [camera,     setCamera]     = useState('')
  const [direction,  setDirection]  = useState<'clockwise' | 'counter_clockwise'>('clockwise')
  const [shadow,     setShadow]     = useState(0.5)
  const [reflection, setReflection] = useState(0.3)
  const [promoTag,   setPromoTag]   = useState('')
  const [showPresets, setShowPresets] = useState(false)

  const [creating,   setCreating]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  async function handleSubmit() {
    if (!product || !name.trim()) { setError('Product and name are required.'); return }
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/product-360/packages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId,
          productId:         product,
          name:              name.trim(),
          description:       desc.trim()   || undefined,
          packageType:       type,
          generationPrompt:  prompt.trim() || undefined,
          generationNotes:   notes.trim()  || undefined,
          targetFrameCount:  frames,
          lightingPreset:    lighting   || null,
          backgroundPreset:  background || null,
          categoryPreset:    category   || null,
          cameraPreset:      camera     || null,
          turnDirection:     direction,
          shadowStrength:    shadow,
          reflectionIntensity: reflection,
          promoTag:          promoTag.trim() || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error ?? 'Failed to create'); return }
      onCreated({ ...json.package, frames_done: 0, product_name: products.find(p => p.id === product)?.name ?? null })
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl premium-panel premium-border rounded-2xl p-6 shadow-panel-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-fuchsia-400/10 border border-fuchsia-400/20 flex items-center justify-center">
              <Rotate3D className="h-4 w-4 text-fuchsia-400" />
            </div>
            <h2 className="text-base font-bold text-white">New 360° Package</h2>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg text-white/30 hover:text-white hover:bg-white/8 transition-colors flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-xs text-red-400">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Product */}
          <Field label="Product" className="sm:col-span-2">
            <select value={product} onChange={e => setProduct(e.target.value)} className="store-input">
              <option value="">Select a product…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>

          {/* Name */}
          <Field label="Package Name">
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Standard View, Summer Promo…" className="store-input" />
          </Field>

          {/* Description */}
          <Field label="Description">
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Optional description" className="store-input" />
          </Field>

          {/* Frame source */}
          <Field label="Frame Source" className="sm:col-span-2">
            <div className="grid grid-cols-2 gap-2">
              {(['ai_generated', 'uploaded_frames'] as const).map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`h-10 rounded-xl text-xs font-medium border transition-colors ${
                    type === t
                      ? 'bg-fuchsia-400/10 border-fuchsia-400/30 text-fuchsia-400'
                      : 'bg-white/4 border-white/8 text-white/40 hover:text-white hover:bg-white/8'
                  }`}>
                  {t === 'ai_generated' ? '⚡ AI Generated (Gemini)' : '📁 Manual Upload'}
                </button>
              ))}
            </div>
          </Field>

          {/* Camera preset → frames */}
          <Field label="Camera Preset">
            <select value={camera} onChange={e => {
              setCamera(e.target.value)
              const preset = CAMERA_PRESETS.find(p => p.value === e.target.value)
              if (preset) {
                if (e.target.value.includes('18')) setFrames(18)
                else if (e.target.value.includes('24')) setFrames(24)
                else if (e.target.value.includes('36')) setFrames(36)
              }
            }} className="store-input">
              <option value="">Choose preset…</option>
              {CAMERA_PRESETS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
            </select>
          </Field>

          {/* Frame count */}
          <Field label="Frame Count">
            <div className="grid grid-cols-3 gap-2">
              {FRAME_COUNT_OPTIONS.map(n => (
                <button key={n.value} type="button" onClick={() => setFrames(n.value)}
                  className={`h-9 rounded-xl text-xs font-medium border transition-colors ${
                    frames === n.value
                      ? 'bg-fuchsia-400/10 border-fuchsia-400/30 text-fuchsia-400'
                      : 'bg-white/4 border-white/8 text-white/40 hover:text-white hover:bg-white/8'
                  }`}>
                  {n.value}
                </button>
              ))}
            </div>
          </Field>

          {/* AI Prompt */}
          {type === 'ai_generated' && (
            <Field label="AI Prompt / Product Description" className="sm:col-span-2">
              <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={3}
                placeholder="Describe the product for AI generation. The more detail the more consistent results."
                className="store-input resize-none" />
            </Field>
          )}

          {/* Presets collapsible */}
          <div className="sm:col-span-2">
            <button
              type="button"
              onClick={() => setShowPresets(v => !v)}
              className="w-full flex items-center justify-between py-2 text-xs font-medium text-white/50 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Lighting, Background & Style Presets
              </span>
              <ChevronRight className={`h-3.5 w-3.5 transition-transform ${showPresets ? 'rotate-90' : ''}`} />
            </button>
            {showPresets && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/6">
                <Field label="Lighting">
                  <select value={lighting} onChange={e => setLighting(e.target.value)} className="store-input">
                    <option value="">Auto</option>
                    {LIGHTING_PRESETS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                  </select>
                </Field>
                <Field label="Background">
                  <select value={background} onChange={e => setBackground(e.target.value)} className="store-input">
                    <option value="">Auto</option>
                    {BACKGROUND_PRESETS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                  </select>
                </Field>
                <Field label="Product Category">
                  <select value={category} onChange={e => setCategory(e.target.value)} className="store-input">
                    <option value="">Auto-detect</option>
                    {CATEGORY_PRESETS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                  </select>
                </Field>
                <Field label="Turn Direction">
                  <select value={direction} onChange={e => setDirection(e.target.value as typeof direction)} className="store-input">
                    {TURN_DIRECTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.icon} {o.label}</option>)}
                  </select>
                </Field>
                <Field label={`Shadow Strength (${Math.round(shadow * 100)}%)`}>
                  <input type="range" min={0} max={1} step={0.05} value={shadow}
                    onChange={e => setShadow(parseFloat(e.target.value))}
                    className="w-full accent-fuchsia-400" />
                </Field>
                <Field label={`Reflection (${Math.round(reflection * 100)}%)`}>
                  <input type="range" min={0} max={1} step={0.05} value={reflection}
                    onChange={e => setReflection(parseFloat(e.target.value))}
                    className="w-full accent-fuchsia-400" />
                </Field>
                <Field label="Promo Tag">
                  <input type="text" value={promoTag} onChange={e => setPromoTag(e.target.value)}
                    placeholder="e.g. summer-2026, holiday…" className="store-input" />
                </Field>
                <Field label="Style Notes">
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Additional generation notes…" className="store-input" />
                </Field>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6 pt-4 border-t border-white/6">
          <Button variant="secondary" className="flex-1" onClick={onClose} disabled={creating}>Cancel</Button>
          <Button variant="primary"   className="flex-1" onClick={handleSubmit} loading={creating}>
            Create Package
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  )
}
