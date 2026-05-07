'use client'
// components/product-360/Product360StudioClient.tsx
// Full 360 Product Studio dashboard — product browser, package manager, preset editor.

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Rotate3D, Plus, Trash2, Zap, Upload, Eye, EyeOff,
  Star, StarOff, RefreshCw, AlertCircle, X, Loader2,
  Search, Package, ChevronDown, Copy, Archive, ArchiveRestore,
  SlidersHorizontal, ChevronRight, Image as ImageIcon,
  Check, Lock, Sparkles, Square, Clock, LayoutGrid, Wrench,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import Product360ViewerClient from './Product360ViewerClient'
import Product360SequencePreview from './Product360SequencePreview'
import { Product360ViewerErrorBoundary } from './Product360ViewerErrorBoundary'
import type { P360Package, P360Frame, P360PackageSummary, P360StoreProduct, P360FrameStatus } from '@/lib/product-360/types'
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
  draft:        'text-white/40 bg-white/4 border-white/8',
  queued:       'text-sky-400 bg-sky-400/10 border-sky-400/20',
  planning:     'text-sky-400 bg-sky-400/10 border-sky-400/20',
  generating:   'text-amber-400 bg-amber-400/10 border-amber-400/20',
  processing:   'text-violet-400 bg-violet-400/10 border-violet-400/20',
  paused_quota: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  ready:        'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  completed:    'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
  failed:       'text-red-400 bg-red-400/10 border-red-400/20',
  cancelled:    'text-white/30 bg-white/4 border-white/8',
  archived:     'text-white/20 bg-white/3 border-white/5',
}

const STATUS_LABELS: Record<string, string> = {
  draft:            'Draft',
  queued:           'Queued',
  planning:         'Planning…',
  generating:       'Generating…',
  polling_provider: 'Polling AI…',
  uploading:        'Uploading…',
  processing:       'Processing…',
  paused_quota:     'Quota Paused',
  ready:            'Ready',
  completed:        'Completed',
  failed:           'Failed',
  cancelled:        'Stopped',
  archived:         'Archived',
}

const STATUS_STYLES_EXTRA: Record<string, string> = {
  polling_provider: 'text-sky-400 bg-sky-400/10 border-sky-400/20',
  uploading:        'text-violet-400 bg-violet-400/10 border-violet-400/20',
}

function getStatusStyle(status: string): string {
  return STATUS_STYLES[status] ?? STATUS_STYLES_EXTRA[status] ?? 'text-white/40 bg-white/4 border-white/8'
}

const PROVIDER_LABELS: Record<string, string> = {
  gemini:   'Gemini / Imagen',
  leonardo: 'Leonardo AI',
}

// How long (ms) a generating/queued package can go without a DB update
// before we consider it stale and warn the user.
const STALE_THRESHOLD_MS = 10 * 60 * 1000  // 10 minutes

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
  // Completed frame URLs per package — populated by polling, used for in-progress sequence preview
  const [packageFrameUrls, setPackageFrameUrls] = useState<Record<string, string[]>>({})

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

  // Cancel generation
  const [cancelTarget,  setCancelTarget]  = useState<string | null>(null)
  const [cancellingId,  setCancellingId]  = useState<string | null>(null)
  const [cancelError,   setCancelError]   = useState<string | null>(null)

  // Archive / unarchive
  const [archiveTarget,    setArchiveTarget]    = useState<P360PackageSummary | null>(null)
  const [archivingId,      setArchivingId]      = useState<string | null>(null)
  const [unarchivingId,    setUnarchivingId]    = useState<string | null>(null)
  const [archiveError,     setArchiveError]     = useState<string | null>(null)

  // Status filter tab — controls which packages are shown in the centre column
  type StatusFilter = 'all' | 'queued' | 'generating' | 'completed' | 'failed' | 'cancelled' | 'archived'
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')

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
      const qs = new URLSearchParams({ tenantId: tid, archived: 'true' })
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
  // Polls every 8 s while any package is in queued / generating / processing.
  // Stops automatically when all in-progress packages reach a terminal state.
  //
  // Monotonic progress guarantee:
  //   frames_done and progress_percent are only ever allowed to INCREASE.
  //   If the server returns a lower value (stale response or batch-update lag),
  //   the client keeps the higher value it already has.
  //   This prevents the "jumps backward from 20/24 to 18/24" regression.

  useEffect(() => {
    const inProgress = packages.filter(
      p => p.status === 'queued' || p.status === 'planning' || p.status === 'generating' || p.status === 'processing',
    )
    if (!inProgress.length) return

    const timer = setInterval(async () => {
      for (const pkg of inProgress) {
        let d: Record<string, unknown>
        try {
          const res = await fetch(
            `/api/product-360/packages/${pkg.id}/generation-status?tenantId=${tenantId}`,
          )
          if (!res.ok) continue
          d = await res.json()
        } catch {
          continue
        }

        const serverFrames    = (d.framesCompleted  as number) ?? 0
        const serverProgress  = (d.progressPercent  as number) ?? 0
        const serverPreview   = (d.previewUrl       as string | null) ?? null
        const serverFrameUrls = (d.completedFrameUrls as string[] | undefined) ?? []
        // Terminal = stop polling
        const terminalStatuses = ['ready', 'completed', 'failed', 'paused_quota', 'cancelled', 'archived']

        setPackages(prev => prev.map(p => {
          if (p.id !== pkg.id) return p
          return {
            ...p,
            status:            d.status as P360PackageSummary['status'],
            frames_done:       Math.max(p.frames_done      ?? 0, serverFrames),
            progress_percent:  Math.max(p.progress_percent ?? 0, serverProgress),
            preview_image_url: serverPreview ?? p.preview_image_url,
            cover_frame_url:   serverPreview ?? p.cover_frame_url,
            generation_error:  (d.error     as string | null) ?? p.generation_error,
          }
        }))

        if (serverFrameUrls.length > 0) {
          setPackageFrameUrls(prev => ({
            ...prev,
            [pkg.id]: serverFrameUrls,
          }))
        }

        if (terminalStatuses.includes(d.status as string)) {
          fetchPackages(tenantId, selectedProd?.id)
        }
      }
    }, 8_000)

    return () => clearInterval(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packages, tenantId, selectedProd?.id])

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

  // ── Pump loop active tracking ─────────────────────────────────────────────
  const pumpActiveRef = useRef<Set<string>>(new Set())

  // ── Core pump loop ────────────────────────────────────────────────────────
  // Calls /pump repeatedly (one frame per request) until done or error.
  //
  // Response format from /pump:
  //   success: { ok: true, hasMore, done, packageStatus, progressPercent,
  //              framesDone, totalFrames, imageUrl, previewUrl, message }
  //   failure: { ok: false, errorCode, errorMessage, errorDetails, failedStage }
  //
  // eslint-disable-next-line react-hooks/exhaustive-deps
  async function runPumpLoop(pkgId: string) {
    if (pumpActiveRef.current.has(pkgId)) return
    pumpActiveRef.current.add(pkgId)
    const MAX_ITERS = 200
    try {
      for (let i = 0; i < MAX_ITERS; i++) {
        const snapshot = packages.find(p => p.id === pkgId)
        if (snapshot?.status === 'cancelled') break

        let pumpJson: Record<string, unknown>
        try {
          const pumpRes = await fetch(`/api/product-360/packages/${pkgId}/pump`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ tenantId }),
          })
          pumpJson = await pumpRes.json() as Record<string, unknown>
        } catch {
          // True network failure — fetch never reached the server
          setPackages(prev => prev.map(p =>
            p.id === pkgId
              ? { ...p, status: 'failed' as const, generation_error: 'Network request failed before reaching server. Check your connection and try again.' }
              : p,
          ))
          break
        }

        // New flat response format: { ok: false, errorCode, errorMessage, ... }
        if (!pumpJson.ok) {
          const errorCode    = (pumpJson.errorCode    as string | undefined) ?? 'unknown_error'
          const errorMessage = (pumpJson.errorMessage as string | undefined) ?? 'Generation failed'
          const errorDetails = (pumpJson.errorDetails as string | undefined) ?? null
          const failedStage  = (pumpJson.failedStage  as string | undefined) ?? null
          const retryAt      = (pumpJson.retryAt      as string | undefined) ?? null

          const isQuota = errorCode === 'quota_exceeded' || pumpJson.status === 429
          const st      = isQuota ? 'paused_quota' as const : 'failed' as const

          const displayMessage = errorDetails
            ? `${errorMessage} (stage: ${failedStage ?? 'unknown'}) — ${errorDetails}`
            : errorMessage

          setPackages(prev => prev.map(p =>
            p.id === pkgId ? {
              ...p,
              status:           st,
              generation_error: displayMessage,
              ...(retryAt ? { next_retry_at: retryAt } : {}),
            } : p,
          ))
          break
        }

        // Success path — top-level fields (new flat format)
        const done         = !!(pumpJson.done)
        const hasMore      = !!(pumpJson.hasMore)
        const pkgStatus    = pumpJson.packageStatus  as P360PackageSummary['status'] | undefined
        const progressPct  = (pumpJson.progressPercent as number | undefined) ?? 0
        const framesDone   = (pumpJson.framesDone    as number | undefined) ?? undefined
        const remaining    = (pumpJson.remainingFrames as number | undefined) ?? undefined
        const previewUrl   = (pumpJson.previewUrl    as string | null | undefined) ?? null
        const newFrameUrl  = (pumpJson.imageUrl      as string | null | undefined) ?? null

        setPackages(prev => prev.map(p => {
          if (p.id !== pkgId) return p
          const target    = p.target_frame_count ?? 0
          const framesNow = framesDone !== undefined
            ? framesDone
            : remaining !== undefined ? target - remaining : p.frames_done ?? 0
          return {
            ...p,
            status:            pkgStatus ?? p.status,
            frames_done:       Math.max(p.frames_done ?? 0, framesNow),
            progress_percent:  Math.max(p.progress_percent ?? 0, progressPct),
            preview_image_url: previewUrl ?? p.preview_image_url,
            cover_frame_url:   previewUrl ?? p.cover_frame_url,
          }
        }))

        if (newFrameUrl) {
          setPackageFrameUrls(prev => {
            const existing = prev[pkgId] ?? []
            if (existing.includes(newFrameUrl)) return prev
            return { ...prev, [pkgId]: [...existing, newFrameUrl] }
          })
        }

        if (done || !hasMore) { fetchPackages(tenantId, selectedProd?.id); break }
        await new Promise<void>(r => setTimeout(r, 400))
      }
    } finally {
      pumpActiveRef.current.delete(pkgId)
      setGeneratingId(null)
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  async function handleGenerate(pkgId: string, opts?: { forceResume?: boolean }) {
    const currentPkg = packages.find(p => p.id === pkgId)
    const isResume   = currentPkg?.status === 'paused_quota' || currentPkg?.status === 'failed'

    setPackages(prev => prev.map(p =>
      p.id === pkgId
        ? {
            ...p,
            status:           'queued' as const,
            frames_done:      isResume ? (p.frames_done ?? 0) : 0,
            progress_percent: isResume ? (p.progress_percent ?? 0) : 0,
            generation_error: null,
          }
        : p,
    ))
    setGeneratingId(pkgId)
    try {
      const res  = await fetch(`/api/product-360/packages/${pkgId}/generate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId,
          pumpMode: true,
          ...(opts?.forceResume ? { forceResume: true } : {}),
        }),
      })
      const json = await res.json() as Record<string, unknown>

      if (!res.ok) {
        const errObj    = (json.error as Record<string, unknown> | undefined) ?? {}
        const errType   = errObj.type  as string | undefined
        const errMsg    = (errObj.message as string | undefined) ?? 'Generation failed'
        const newStatus = errType === 'quota_exceeded' ? 'paused_quota' as const : 'failed' as const
        setPackages(prev => prev.map(p =>
          p.id === pkgId ? { ...p, status: newStatus, generation_error: errMsg } : p,
        ))
        setGeneratingId(null)
        return
      }

      const data = (json.data as Record<string, unknown> | undefined) ?? json

      if (data.pumpMode) {
        // Pump mode: route returned immediately — client drives generation
        setPackages(prev => prev.map(p =>
          p.id === pkgId ? { ...p, status: 'generating' as const } : p,
        ))
        runPumpLoop(pkgId)  // clears generatingId in its finally
        return
      }

      // Synchronous legacy mode
      setPackages(prev => prev.map(p =>
        p.id === pkgId
          ? {
              ...p,
              status:            ((data.status as P360PackageSummary['status']) ?? 'ready'),
              frames_done:       (data.framesGenerated as number) ?? p.frames_done,
              progress_percent:  (data.status as string) === 'ready' ? 100 : p.progress_percent,
              preview_image_url: (data.previewUrl as string | null) ?? p.preview_image_url,
              cover_frame_url:   (data.previewUrl as string | null) ?? p.cover_frame_url,
            }
          : p,
      ))
    } catch {
      setPackages(prev => prev.map(p =>
        p.id === pkgId ? { ...p, status: 'failed' as const, generation_error: 'Network error' } : p,
      ))
    } finally {
      if (!pumpActiveRef.current.has(pkgId)) {
        setGeneratingId(null)
        fetchPackages(tenantId, selectedProd?.id)
      }
    }
  }

  async function handleRegenerate(pkgId: string) {
    if (!confirm('Regenerate all frames? This will overwrite existing frames.')) return
    setPackages(prev => prev.map(p =>
      p.id === pkgId
        ? { ...p, status: 'queued' as const, frames_done: 0, progress_percent: 0, generation_error: null }
        : p,
    ))
    setGeneratingId(pkgId)
    try {
      const res  = await fetch(`/api/product-360/packages/${pkgId}/regenerate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId }),
      })
      const json = await res.json()
      if (!res.ok) {
        setPackages(prev => prev.map(p =>
          p.id === pkgId ? { ...p, status: 'failed' as const, generation_error: json.error ?? 'Regeneration failed' } : p,
        ))
      }
    } catch {
      setPackages(prev => prev.map(p =>
        p.id === pkgId ? { ...p, status: 'failed' as const, generation_error: 'Network error' } : p,
      ))
    } finally {
      setGeneratingId(null)
      fetchPackages(tenantId, selectedProd?.id)
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
    // If already primary, toggle off via PATCH; otherwise use /set-primary which
    // atomically unsets all other primaries for the same product.
    const currentlyPrimary = pkg.is_primary || pkg.is_default
    if (currentlyPrimary) {
      // Toggle off
      setPackages(prev => prev.map(p => p.id === pkg.id
        ? { ...p, is_primary: false, is_default: false } : p,
      ))
      await fetch(`/api/product-360/packages/${pkg.id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_primary: false, is_default: false }),
      })
    } else {
      // Set as primary via the dedicated endpoint (handles atomically unsetting others)
      setPackages(prev => prev.map(p => ({
        ...p,
        is_primary: p.id === pkg.id,
        is_default: p.id === pkg.id,
      })))
      const res = await fetch(`/api/product-360/packages/${pkg.id}/set-primary?tenantId=${tenantId}`, {
        method: 'POST',
      })
      if (!res.ok) {
        // Revert optimistic update on failure
        fetchPackages(tenantId, selectedProd?.id)
      }
    }
  }

  function handleArchive(pkg: P360PackageSummary) {
    setArchiveTarget(pkg)
  }

  async function handleCancelGeneration(pkgId: string) {
    setCancelTarget(null)
    setCancelError(null)
    setCancellingId(pkgId)

    // Optimistic UI: mark as cancelled immediately so polling stops
    setPackages(prev => prev.map(p =>
      p.id === pkgId ? { ...p, status: 'cancelled' as const } : p,
    ))

    try {
      const res  = await fetch(`/api/product-360/packages/${pkgId}/cancel`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId }),
      })
      const json = await res.json() as Record<string, unknown>
      if (!res.ok) {
        // Revert optimistic update
        fetchPackages(tenantId, selectedProd?.id)
        const errObj = (json.error as Record<string, unknown> | undefined) ?? {}
        setCancelError((errObj.message as string) ?? 'Failed to stop generation. Please try again.')
      } else {
        // Reload to get accurate frames_done count
        fetchPackages(tenantId, selectedProd?.id)
      }
    } catch {
      fetchPackages(tenantId, selectedProd?.id)
      setCancelError('Network error — could not stop generation. Please try again.')
    } finally {
      setCancellingId(null)
    }
  }

  async function handleArchivePackage(pkg: P360PackageSummary, archiveReason?: string) {
    setArchiveTarget(null)
    setArchiveError(null)
    setArchivingId(pkg.id)
    // Optimistic: mark as archived in the list
    setPackages(prev => prev.map(p =>
      p.id === pkg.id ? { ...p, status: 'archived' as const, is_enabled: false } : p,
    ))
    try {
      const res  = await fetch(`/api/product-360/packages/${pkg.id}/archive`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId, archiveReason: archiveReason ?? null }),
      })
      const json = await res.json() as Record<string, unknown>
      if (!res.ok) {
        fetchPackages(tenantId, selectedProd?.id)
        const errObj = (json.error as Record<string, unknown> | undefined) ?? {}
        setArchiveError((errObj.message as string) ?? 'Failed to archive package.')
      } else {
        fetchPackages(tenantId, selectedProd?.id)
      }
    } catch {
      fetchPackages(tenantId, selectedProd?.id)
      setArchiveError('Network error — could not archive package.')
    } finally {
      setArchivingId(null)
    }
  }

  async function handleRequeue(pkgId: string) {
    setGeneratingId(pkgId)
    try {
      const res  = await fetch(`/api/product-360/packages/${pkgId}/requeue`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId }),
      })
      const json = await res.json() as Record<string, unknown>
      if (!res.ok) {
        const errMsg = ((json.error as Record<string, unknown> | undefined)?.message as string | undefined) ?? 'Failed to requeue package'
        setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, generation_error: errMsg } : p))
      } else {
        fetchPackages(tenantId, selectedProd?.id)
      }
    } catch {
      setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, generation_error: 'Network error' } : p))
    } finally {
      setGeneratingId(null)
    }
  }

  async function handleRepairAndResume(pkgId: string) {
    setGeneratingId(pkgId)
    try {
      const res  = await fetch(`/api/product-360/packages/${pkgId}/repair`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId }),
      })
      const json = await res.json() as Record<string, unknown>
      if (!res.ok || !json.ok) {
        const errMsg = (json.errorMessage as string | undefined) ?? 'Repair failed'
        setPackages(prev => prev.map(p => p.id === pkgId ? { ...p, generation_error: errMsg } : p))
        setGeneratingId(null)
        return
      }
      // If repair set status to 'queued', immediately start generation
      if (json.readyToResume) {
        setPackages(prev => prev.map(p =>
          p.id === pkgId ? {
            ...p,
            status: 'queued' as const,
            generation_error: null,
            frames_done:      (json.diagnostics as Record<string, unknown>)?.frames
              ? ((json.diagnostics as Record<string, unknown>).frames as Record<string, unknown>).completed as number
              : p.frames_done,
          } : p,
        ))
        // Trigger pump-mode generation
        const genRes  = await fetch(`/api/product-360/packages/${pkgId}/generate`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ tenantId, pumpMode: true }),
        })
        const genJson = await genRes.json() as Record<string, unknown>
        const genData = (genJson.data as Record<string, unknown> | undefined) ?? genJson
        if (genJson.ok !== false && genData.pumpMode) {
          setPackages(prev => prev.map(p =>
            p.id === pkgId ? { ...p, status: 'generating' as const } : p,
          ))
          runPumpLoop(pkgId)
          return   // generatingId cleared by pump loop's finally block
        }
      }
      fetchPackages(tenantId, selectedProd?.id)
    } catch {
      setPackages(prev => prev.map(p =>
        p.id === pkgId ? { ...p, generation_error: 'Network error during repair' } : p,
      ))
    } finally {
      // If we didn't hand off to runPumpLoop, clear generatingId here
      if (!pumpActiveRef.current.has(pkgId)) setGeneratingId(null)
    }
  }

  async function handleUnarchivePackage(pkgId: string) {
    setArchiveError(null)
    setUnarchivingId(pkgId)
    try {
      const res  = await fetch(`/api/product-360/packages/${pkgId}/unarchive`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId }),
      })
      const json = await res.json() as Record<string, unknown>
      if (!res.ok) {
        const errObj = (json.error as Record<string, unknown> | undefined) ?? {}
        setArchiveError((errObj.message as string) ?? 'Failed to unarchive package.')
      }
      fetchPackages(tenantId, selectedProd?.id)
    } catch {
      setArchiveError('Network error — could not unarchive package.')
      fetchPackages(tenantId, selectedProd?.id)
    } finally {
      setUnarchivingId(null)
    }
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

          {/* ── Status summary chips ── */}
          {(() => {
            const counts: Record<string, number> = {}
            for (const p of packages) counts[p.status] = (counts[p.status] ?? 0) + 1
            const chips = [
              { filter: 'queued'     as const, label: 'Queue',     color: 'text-sky-400 bg-sky-400/8 border-sky-400/20',         count: (counts.queued ?? 0) + (counts.planning ?? 0) },
              { filter: 'generating' as const, label: 'Generating', color: 'text-amber-400 bg-amber-400/8 border-amber-400/20',   count: (counts.generating ?? 0) + (counts.processing ?? 0) },
              { filter: 'completed'  as const, label: 'Done',       color: 'text-emerald-400 bg-emerald-400/8 border-emerald-400/20', count: (counts.ready ?? 0) + (counts.completed ?? 0) },
              { filter: 'failed'     as const, label: 'Failed',     color: 'text-red-400 bg-red-400/8 border-red-400/20',         count: counts.failed ?? 0 },
              { filter: 'cancelled'  as const, label: 'Stopped',    color: 'text-white/40 bg-white/4 border-white/10',            count: counts.cancelled ?? 0 },
              { filter: 'archived'   as const, label: 'Archived',   color: 'text-white/30 bg-white/3 border-white/8',             count: counts.archived ?? 0 },
            ].filter(c => c.count > 0)
            if (!chips.length) return null
            return (
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setStatusFilter('all')}
                  className={`h-6 px-2.5 rounded-full text-[10px] font-medium border transition-colors ${statusFilter === 'all' ? 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20' : 'text-white/30 bg-white/4 border-white/8 hover:text-white'}`}
                >
                  All {packages.length}
                </button>
                {chips.map(c => (
                  <button
                    key={c.filter}
                    onClick={() => setStatusFilter(c.filter)}
                    className={`h-6 px-2.5 rounded-full text-[10px] font-medium border transition-colors ${statusFilter === c.filter ? c.color : 'text-white/30 bg-white/4 border-white/8 hover:text-white'}`}
                  >
                    {c.label} {c.count}
                  </button>
                ))}
              </div>
            )
          })()}

          {pkgError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <p className="text-xs text-red-400">{pkgError}</p>
            </div>
          )}

          {cancelError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400">{cancelError}</p>
              </div>
              <button onClick={() => setCancelError(null)} className="text-red-400/50 hover:text-red-400 transition-colors shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {archiveError && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-400">{archiveError}</p>
              </div>
              <button onClick={() => setArchiveError(null)} className="text-red-400/50 hover:text-red-400 transition-colors shrink-0">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {(() => {
            // Filter packages by the active status tab
            const ACTIVE_STATUSES = ['queued', 'planning', 'generating', 'processing']
            const filtered = packages.filter(p => {
              if (statusFilter === 'all')       return true
              if (statusFilter === 'queued')     return ACTIVE_STATUSES.includes(p.status) && (p.status === 'queued' || p.status === 'planning')
              if (statusFilter === 'generating') return p.status === 'generating' || p.status === 'processing'
              if (statusFilter === 'completed')  return p.status === 'ready' || p.status === 'completed'
              if (statusFilter === 'failed')     return p.status === 'failed' || p.status === 'paused_quota'
              if (statusFilter === 'cancelled')  return p.status === 'cancelled'
              if (statusFilter === 'archived')   return p.status === 'archived'
              return true
            })

            if (pkgLoading) {
              return Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-28 rounded-2xl bg-white/4 border border-white/8 animate-pulse" />
              ))
            }
            if (filtered.length === 0) {
              return (
                statusFilter !== 'all'
                  ? (
                    <div className="py-12 text-center rounded-2xl border border-white/6 border-dashed">
                      <LayoutGrid className="h-6 w-6 text-white/20 mx-auto mb-2" />
                      <p className="text-xs text-white/30">No {statusFilter} packages</p>
                      <button onClick={() => setStatusFilter('all')} className="mt-2 text-[10px] text-fuchsia-400 hover:text-fuchsia-300 underline">
                        Show all
                      </button>
                    </div>
                  )
                  : <PackageEmptyState hasProduct={!!selectedProd} onAdd={() => setShowCreate(true)} />
              )
            }
            return filtered.map(pkg => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                completedFrameUrls={packageFrameUrls[pkg.id]}
                onGenerate={handleGenerate}
                onRegenerate={handleRegenerate}
                onToggleEnabled={handleToggleEnabled}
                onSetDefault={handleSetDefault}
                onArchive={handleArchive}
                onUnarchive={handleUnarchivePackage}
                onRequeue={handleRequeue}
                onRepair={handleRepairAndResume}
                onPreview={handlePreview}
                onDuplicate={p => { setShowDuplicate(p); setDupName(`${p.name} (Copy)`) }}
                onUpload={pkgId => { setUploadingFor(pkgId); setUploadIdx(0); fileInputRef.current?.click() }}
                onCancel={id => setCancelTarget(id)}
                generatingId={generatingId}
                cancellingId={cancellingId}
                archivingId={archivingId}
                unarchivingId={unarchivingId}
                previewLoading={previewLoading}
              />
            ))
          })()}
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
                {(() => {
                  const isInProgress = (
                    previewPkg.status === 'queued' ||
                    previewPkg.status === 'planning' ||
                    previewPkg.status === 'generating' ||
                    previewPkg.status === 'processing'
                  )
                  const isPausedOrFailed = previewPkg.status === 'paused_quota' || previewPkg.status === 'failed'
                  const liveUrls  = packageFrameUrls[previewPkg.id] ?? []
                  const frameUrls = previewPkg.frames.map(f => f.image_url).filter(Boolean) as string[]

                  // Prioritise live polling URLs during active generation
                  const displayUrls = liveUrls.length > 0 ? liveUrls : frameUrls

                  // While generating: lightweight sequence preview
                  if (isInProgress) {
                    const inProgressPkg = packages.find(p => p.id === previewPkg.id)
                    return (
                      <Product360SequencePreview
                        frameUrls={liveUrls}
                        isGenerating
                        framesCompleted={inProgressPkg?.frames_done}
                        framesTotal={inProgressPkg?.target_frame_count}
                        productName={previewPkg.name}
                      />
                    )
                  }

                  // Paused or failed with ≥ 6 frames: show partial preview
                  if (isPausedOrFailed && displayUrls.length >= 6) {
                    return (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-2">
                          <AlertCircle className="h-3 w-3 text-orange-400 shrink-0" />
                          <p className="text-[11px] text-orange-400">
                            Partial preview — {displayUrls.length} of {previewPkg.target_frame_count} frames
                          </p>
                        </div>
                        <Product360SequencePreview
                          frameUrls={displayUrls}
                          isGenerating={false}
                          productName={previewPkg.name}
                        />
                      </div>
                    )
                  }

                  // Paused/failed with < 6 frames
                  if (isPausedOrFailed) {
                    return (
                      <div className="aspect-square rounded-2xl bg-orange-400/5 border border-orange-400/20 flex flex-col items-center justify-center gap-3 p-6 text-center">
                        <AlertCircle className="h-8 w-8 text-orange-400/50" />
                        <p className="text-xs text-orange-400/80">
                          Only {displayUrls.length} frame{displayUrls.length !== 1 ? 's' : ''} generated.
                          At least 6 are needed for a preview.
                        </p>
                        <p className="text-[10px] text-white/30">Resume generation to continue.</p>
                      </div>
                    )
                  }

                  // Completed: premium Three.js viewer wrapped in error boundary
                  if (displayUrls.length > 0) {
                    return (
                      <Product360ViewerErrorBoundary
                        frameUrls={displayUrls}
                        productName={previewPkg.name}
                      >
                        <Product360ViewerClient
                          frames={previewPkg.frames}
                          hotspots={[]}
                          viewerSettings={{ autoRotate: false, showControls: true, enableHotspots: false }}
                          packageName={previewPkg.name}
                          showLabel
                        />
                      </Product360ViewerErrorBoundary>
                    )
                  }

                  return (
                    <div className="aspect-square rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
                      <p className="text-xs text-white/30">No frames yet</p>
                    </div>
                  )
                })()}
                <PackageDetailInfo pkg={previewPkg} />
                {previewPkg.frames.length > 0 && (
                  <FrameStatusGrid frames={previewPkg.frames} />
                )}
                {/* Debug panel — owner/admin only */}
                {isOwner && (
                  <PackageDebugPanel pkg={previewPkg} />
                )}
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

      {/* Archive Package Confirmation Modal */}
      {archiveTarget && (() => {
        const isGenerating = ['queued', 'planning', 'generating', 'processing'].includes(archiveTarget.status)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm premium-panel premium-border rounded-2xl p-6 shadow-panel-lg space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white/8 border border-white/12 flex items-center justify-center shrink-0">
                  <Archive className="h-4 w-4 text-white/60" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Archive 360 package?</h2>
                  <p className="text-xs text-white/40 truncate max-w-[200px]">{archiveTarget.name}</p>
                </div>
              </div>
              {isGenerating ? (
                <div className="flex items-start gap-2 rounded-lg bg-orange-400/8 border border-orange-400/20 px-3 py-2.5">
                  <AlertCircle className="h-3 w-3 text-orange-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-orange-400 leading-relaxed">
                    This package is currently generating. It will be force-archived and generation will be abandoned.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-white/60 leading-relaxed">
                  This moves the package out of active views. Completed images are kept. You can unarchive it later.
                </p>
              )}
              {(archiveTarget.frames_done ?? 0) > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-teal-400/8 border border-teal-400/15 px-3 py-2">
                  <Check className="h-3 w-3 text-teal-400 shrink-0" />
                  <p className="text-[11px] text-teal-400">
                    {archiveTarget.frames_done} frame{archiveTarget.frames_done !== 1 ? 's' : ''} will be preserved
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setArchiveTarget(null)}
                  className="flex-1 h-9 rounded-xl text-sm font-medium text-white/60 bg-white/6 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Keep Active
                </button>
                <button
                  onClick={() => handleArchivePackage(archiveTarget, isGenerating ? 'Force-archived while generating' : undefined)}
                  disabled={archivingId === archiveTarget.id}
                  className="flex-1 h-9 rounded-xl text-sm font-medium text-white/70 bg-white/8 border border-white/15 hover:bg-white/15 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {archivingId === archiveTarget.id
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Archiving…</>
                    : <><Archive className="h-3.5 w-3.5" /> Archive Package</>
                  }
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Cancel Generation Confirmation Modal */}
      {cancelTarget && (() => {
        const targetPkg = packages.find(p => p.id === cancelTarget)
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-sm premium-panel premium-border rounded-2xl p-6 shadow-panel-lg space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <Square className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white">Stop 360° generation?</h2>
                  {targetPkg && <p className="text-xs text-white/40 truncate max-w-[200px]">{targetPkg.name}</p>}
                </div>
              </div>
              <p className="text-xs text-white/60 leading-relaxed">
                This will stop generating new frames. Any frames already generated will be saved and the package can be resumed later.
              </p>
              {targetPkg && (targetPkg.frames_done ?? 0) > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-teal-400/8 border border-teal-400/15 px-3 py-2">
                  <Check className="h-3 w-3 text-teal-400 shrink-0" />
                  <p className="text-[11px] text-teal-400">
                    {targetPkg.frames_done} of {targetPkg.target_frame_count} frames already saved
                  </p>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setCancelTarget(null)}
                  className="flex-1 h-9 rounded-xl text-sm font-medium text-white/60 bg-white/6 border border-white/10 hover:bg-white/10 hover:text-white transition-colors"
                >
                  Keep Generating
                </button>
                <button
                  onClick={() => handleCancelGeneration(cancelTarget)}
                  disabled={cancellingId === cancelTarget}
                  className="flex-1 h-9 rounded-xl text-sm font-medium text-red-400 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {cancellingId === cancelTarget
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Stopping…</>
                    : <><Square className="h-3.5 w-3.5" /> Stop Generation</>
                  }
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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
  pkg:                P360PackageSummary
  completedFrameUrls?: string[]
  onGenerate:         (id: string, opts?: { forceResume?: boolean }) => void
  onRegenerate:       (id: string) => void
  onToggleEnabled:    (pkg: P360PackageSummary) => void
  onSetDefault:       (pkg: P360PackageSummary) => void
  onArchive:          (pkg: P360PackageSummary) => void
  onUnarchive:        (id: string) => void
  onRequeue:          (id: string) => void
  onRepair:           (id: string) => void
  onPreview:          (id: string) => void
  onDuplicate:        (pkg: P360PackageSummary) => void
  onUpload:           (id: string) => void
  onCancel:           (id: string) => void
  generatingId:       string | null
  cancellingId:       string | null
  archivingId:        string | null
  unarchivingId:      string | null
  previewLoading:     boolean
}

function PackageCard({
  pkg, completedFrameUrls, onGenerate, onRegenerate, onToggleEnabled, onSetDefault,
  onArchive, onUnarchive, onRequeue, onRepair, onPreview, onDuplicate, onUpload, onCancel,
  generatingId, cancellingId, archivingId, unarchivingId, previewLoading,
}: PackageCardProps) {
  const isArchived = pkg.status === 'archived'
  const isActiveGeneration = pkg.status === 'generating' || pkg.status === 'queued' || pkg.status === 'processing' || pkg.status === 'planning'

  // Stale detection: generating/queued but no DB update for > 10 min
  const updatedAtMs   = pkg.updated_at ? new Date(pkg.updated_at).getTime() : 0
  const msSinceUpdate = Date.now() - updatedAtMs
  const isStale       = isActiveGeneration && msSinceUpdate > STALE_THRESHOLD_MS
  const canGenerate        = pkg.package_type === 'ai_generated' || pkg.package_type === 'hybrid'

  // Use DB progress_percent if available; compute as fallback
  const progressPct = pkg.progress_percent > 0
    ? pkg.progress_percent
    : pkg.target_frame_count > 0
      ? Math.min(100, Math.round(((pkg.frames_done ?? 0) / pkg.target_frame_count) * 100))
      : 0

  // Package is at 100% but DB hasn't flipped to 'ready' yet
  const isFinalizing = isActiveGeneration && progressPct >= 100

  // Prefer the canonical preview URL; fall back to legacy cover_frame_url
  const previewUrl = pkg.preview_image_url ?? pkg.cover_frame_url ?? null

  // Status label: override with "Finalizing…" if applicable
  const statusLabel = isFinalizing
    ? 'Finalizing…'
    : STATUS_LABELS[pkg.status] ?? pkg.status

  return (
    <div className="premium-panel premium-border rounded-2xl p-4 space-y-3 group">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`inline-flex items-center text-[10px] font-medium px-2 py-0.5 rounded-full border ${getStatusStyle(pkg.status)}`}>
              {isActiveGeneration && <Loader2 className="h-2.5 w-2.5 mr-1 animate-spin" />}
              {statusLabel}
            </span>
            {(pkg.is_primary || pkg.is_default) && (
              <span className="text-[10px] text-amber-400 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full">Primary</span>
            )}
            {pkg.is_enabled && pkg.status === 'ready' && (
              <span className="text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-2 py-0.5 rounded-full">Live</span>
            )}
            {/* Scene lock badge — shown once the master frame exists */}
            {(pkg as P360Package & { master_frame_generated?: boolean }).master_frame_generated && (
              <span className="inline-flex items-center gap-1 text-[10px] text-teal-400 bg-teal-400/10 border border-teal-400/20 px-2 py-0.5 rounded-full">
                <Lock className="h-2.5 w-2.5" />
                Scene Locked
              </span>
            )}
            {/* Blueprint analysis version badge */}
            {(pkg as P360Package & { analysis_version?: number }).analysis_version === 2 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-violet-400 bg-violet-400/10 border border-violet-400/20 px-2 py-0.5 rounded-full" title="Blueprint grounded from Gemini vision analysis of the master frame">
                <Sparkles className="h-2.5 w-2.5" />
                Vision-grounded
              </span>
            )}
            {/* Consistency mode badges */}
            {(pkg as P360Package & { consistency_mode?: string }).consistency_mode === 'ultra_strict' && (
              <span className="inline-flex items-center gap-1 text-[10px] text-orange-400 bg-orange-400/10 border border-orange-400/20 px-2 py-0.5 rounded-full" title="Ultra Strict: locked scene contract, drift detection, auto-regeneration">
                🔒 Ultra Strict
              </span>
            )}
            {(pkg as P360Package & { consistency_mode?: string }).consistency_mode === 'strict' &&
             (pkg as P360Package & { master_frame_generated?: boolean }).master_frame_generated && (
              <span className="text-[10px] text-fuchsia-400 bg-fuchsia-400/10 border border-fuchsia-400/20 px-2 py-0.5 rounded-full" title="Strict mode: every frame validated against master">
                Strict Mode
              </span>
            )}
            {/* Provider badge */}
            {(pkg as P360Package & { generation_provider?: string }).generation_provider === 'leonardo' && (
              <span className="text-[10px] text-indigo-400 bg-indigo-400/10 border border-indigo-400/20 px-2 py-0.5 rounded-full" title="Uses Leonardo AI Blueprint Executions">
                🎨 Leonardo
              </span>
            )}
            {/* Generation stage badge */}
            {(pkg as P360Package & { generation_stage?: string }).generation_stage === 'polling_provider' && (
              <span className="text-[10px] text-sky-400 bg-sky-400/10 border border-sky-400/20 px-2 py-0.5 rounded-full">
                Polling AI…
              </span>
            )}
            {pkg.preset    && <span className="text-[10px] text-sky-400 bg-sky-400/10 border border-sky-400/20 px-2 py-0.5 rounded-full">{pkg.preset}</span>}
            {pkg.promo_tag && <span className="text-[10px] text-fuchsia-400 bg-fuchsia-400/10 border border-fuchsia-400/20 px-2 py-0.5 rounded-full">{pkg.promo_tag}</span>}
          </div>
          <h3 className="text-sm font-semibold text-white truncate">{pkg.name}</h3>
          {pkg.product_name && <p className="text-xs text-white/30 truncate">{pkg.product_name}</p>}
          {/* Preset chips */}
          {(pkg.lighting_preset || pkg.background_preset || pkg.camera_preset) && (
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {pkg.lighting_preset   && <PresetChip label={pkg.lighting_preset.replace(/_/g, ' ')} />}
              {pkg.background_preset && <PresetChip label={pkg.background_preset.replace(/_/g, ' ')} />}
              {pkg.camera_preset     && <PresetChip label={pkg.camera_preset.replace(/_/g, ' ')} />}
            </div>
          )}
          {pkg.last_generated_at && pkg.status === 'ready' && (
            <p className="text-[10px] text-white/20 mt-0.5">
              Generated {new Date(pkg.last_generated_at).toLocaleDateString()}
            </p>
          )}
          {/* Stage-A master frame indicator during active generation */}
          {isActiveGeneration && (pkg as P360Package & { master_frame_generated?: boolean }).master_frame_generated && (
            <p className="flex items-center gap-1 text-[10px] text-teal-400 mt-0.5">
              <Sparkles className="h-2.5 w-2.5 shrink-0" />
              Master frame captured — generating locked frames…
            </p>
          )}
          {isActiveGeneration && !(pkg as P360Package & { master_frame_generated?: boolean }).master_frame_generated && (
            <p className="text-[10px] text-amber-400/70 mt-0.5">Generating master reference frame…</p>
          )}
        </div>
        {/* Thumbnail / live preview */}
        {isActiveGeneration && (completedFrameUrls?.length ?? 0) > 0 ? (
          // While generating: show a tiny interactive sequence scrubber
          <div className="h-12 w-12 rounded-lg overflow-hidden border border-white/8 shrink-0">
            <Product360SequencePreview
              frameUrls={completedFrameUrls!}
              isGenerating
              framesCompleted={pkg.frames_done ?? 0}
              framesTotal={pkg.target_frame_count}
              className="!rounded-none !aspect-auto h-12 w-12"
              sensitivity={4}
            />
          </div>
        ) : previewUrl ? (
          <div className="h-12 w-12 rounded-lg overflow-hidden border border-white/8 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={pkg.name} className="w-full h-full object-cover" />
          </div>
        ) : null}
      </div>

      {/* Progress bar */}
      {pkg.target_frame_count > 0 && (isActiveGeneration || pkg.status === 'paused_quota' || progressPct < 100) && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-white/30">
            <span>{pkg.frames_done ?? 0} / {pkg.target_frame_count} frames</span>
            <span>{progressPct}%</span>
          </div>
          <div className="h-1 rounded-full bg-white/8 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                pkg.status === 'ready' || pkg.status === 'completed'
                  ? 'bg-emerald-400'
                  : pkg.status === 'paused_quota'
                    ? 'bg-orange-400'
                    : isFinalizing
                      ? 'bg-violet-400'
                      : 'bg-fuchsia-400'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Quota warning card */}
      {pkg.status === 'paused_quota' && (
        <div className="rounded-lg bg-orange-400/8 border border-orange-400/20 px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 text-orange-400 shrink-0" />
            <p className="text-xs font-semibold text-orange-400">Image quota reached</p>
          </div>
          <p className="text-[10px] text-orange-300/70 leading-relaxed">
            Generation paused after {pkg.frames_done ?? 0} / {pkg.target_frame_count} frames.
            {(pkg.frames_done ?? 0) >= 6
              ? ' Partial preview is available below.'
              : ' Upgrade your Google Cloud billing or wait for quota reset, then resume.'}
          </p>
        </div>
      )}

      {/* Stale generation warning */}
      {isStale && (
        <div className="rounded-lg bg-yellow-500/8 border border-yellow-500/15 px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 text-yellow-400 shrink-0" />
            <p className="text-xs font-semibold text-yellow-400">Generation appears stuck</p>
          </div>
          <p className="text-[10px] text-yellow-300/70 leading-relaxed">
            No progress for {Math.round(msSinceUpdate / 60000)} min. You can stop and retry.
          </p>
        </div>
      )}

      {/* Cancelled info */}
      {pkg.status === 'cancelled' && (
        <div className="rounded-lg bg-white/4 border border-white/10 px-3 py-2.5 space-y-0.5">
          <div className="flex items-center gap-1.5">
            <Square className="h-3 w-3 text-white/30 shrink-0" />
            <p className="text-xs text-white/50">Generation stopped</p>
          </div>
          {(pkg.frames_done ?? 0) > 0 ? (
            <p className="text-[10px] text-white/30">
              {pkg.frames_done} frame{pkg.frames_done !== 1 ? 's' : ''} saved — resume to complete the spin.
            </p>
          ) : (
            <p className="text-[10px] text-white/30">No frames were generated yet.</p>
          )}
        </div>
      )}

      {/* Processing / provider polling hint */}
      {(pkg.status === 'processing' || (pkg as P360Package & { generation_stage?: string }).generation_stage === 'polling_provider') &&
        pkg.status !== 'failed' && pkg.status !== 'ready' && pkg.status !== 'completed' && (
        <div className="rounded-lg bg-sky-500/8 border border-sky-500/15 px-3 py-2.5 flex items-start gap-2">
          <Loader2 className="h-3 w-3 text-sky-400 shrink-0 animate-spin mt-0.5" />
          <p className="text-[10px] text-sky-300/80 leading-relaxed">
            The provider is still rendering this frame. You can wait or click <strong>Pump/Resume</strong> to continue polling.
          </p>
        </div>
      )}

      {/* Generation error (failed / paused) */}
      {(pkg.generation_error || (pkg as P360Package & { last_error_message?: string; last_provider_error_details?: string }).last_error_message) &&
        pkg.status !== 'cancelled' && (
        <div className="rounded-lg bg-red-500/8 border border-red-500/15 px-3 py-2.5 space-y-1">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />
            <p className="text-xs font-semibold text-red-400">
              {pkg.status === 'paused_quota' ? 'Quota exceeded' : 'Generation failed'}
            </p>
          </div>
          <p className="text-[10px] text-red-300/80 leading-relaxed break-words">
            {pkg.generation_error ?? (pkg as P360Package & { last_error_message?: string }).last_error_message}
          </p>
          {(pkg as P360Package & { last_provider_error_details?: string }).last_provider_error_details && (
            <ExpandableCardDetails
              details={(pkg as P360Package & { last_provider_error_details?: string }).last_provider_error_details!}
            />
          )}
        </div>
      )}

      {/* Partial frames available hint */}
      {(pkg.status === 'paused_quota' || pkg.status === 'failed') && (pkg.frames_done ?? 0) >= 6 && (
        <p className="text-[10px] text-teal-400/70 flex items-center gap-1">
          <Check className="h-2.5 w-2.5 shrink-0" />
          {pkg.frames_done} frames ready — partial 360° preview available
        </p>
      )}

      {/* Archived banner */}
      {isArchived && (
        <div className="rounded-lg bg-white/4 border border-white/8 px-3 py-2 flex items-center gap-2">
          <Archive className="h-3 w-3 text-white/30 shrink-0" />
          <p className="text-[10px] text-white/30 flex-1">
            Archived
            {(pkg as P360Package & { archived_at?: string | null }).archived_at
              ? ` · ${new Date((pkg as P360Package & { archived_at?: string | null }).archived_at!).toLocaleDateString()}`
              : ''}
            {(pkg.frames_done ?? 0) > 0 ? ` · ${pkg.frames_done} frames preserved` : ''}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-1 flex-wrap">
        <ActionBtn onClick={() => onPreview(pkg.id)} disabled={previewLoading} icon={<Eye className="h-3 w-3" />} label="Preview" />

        {/* Stop Generation: queued / generating / processing / planning */}
        {isActiveGeneration && (
          <ActionBtn
            onClick={() => onCancel(pkg.id)}
            disabled={cancellingId === pkg.id}
            icon={cancellingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Square className="h-3 w-3" />}
            label={cancellingId === pkg.id ? 'Stopping…' : isStale ? 'Stop Stuck' : 'Stop'}
            danger
          />
        )}

        {/* Generate: draft */}
        {canGenerate && pkg.status === 'draft' && (
          <ActionBtn
            onClick={() => onGenerate(pkg.id)}
            disabled={generatingId === pkg.id}
            icon={generatingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            label="Generate"
            highlight
          />
        )}

        {/* Resume: cancelled — uses the generate endpoint with resume behaviour */}
        {canGenerate && pkg.status === 'cancelled' && (
          <ActionBtn
            onClick={() => onGenerate(pkg.id)}
            disabled={generatingId === pkg.id}
            icon={generatingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            label={(pkg.frames_done ?? 0) > 0 ? 'Resume' : 'Generate'}
            highlight
          />
        )}

        {/* Retry: failed */}
        {canGenerate && pkg.status === 'failed' && (
          <ActionBtn
            onClick={() => onGenerate(pkg.id)}
            disabled={generatingId === pkg.id}
            icon={generatingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            label="Retry"
            highlight
          />
        )}

        {/* Repair & Resume: failed packages — normalizes blueprint, resets stale frames, then resumes */}
        {canGenerate && pkg.status === 'failed' && (
          <ActionBtn
            onClick={() => onRepair(pkg.id)}
            disabled={generatingId === pkg.id}
            icon={generatingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
            label="Repair & Resume"
          />
        )}

        {/* Reset Stuck: stale-generating packages that need frame reset */}
        {isStale && (
          <ActionBtn
            onClick={() => onRequeue(pkg.id)}
            disabled={generatingId === pkg.id}
            icon={generatingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            label="Reset Stuck"
          />
        )}

        {/* Resume: paused_quota */}
        {canGenerate && pkg.status === 'paused_quota' && (
          <ActionBtn
            onClick={() => onGenerate(pkg.id, { forceResume: true })}
            disabled={generatingId === pkg.id}
            icon={generatingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            label="Resume"
            highlight
          />
        )}

        {canGenerate && (pkg.status === 'ready' || pkg.status === 'completed') && (
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
            icon={(pkg.is_primary || pkg.is_default) ? <Star className="h-3 w-3 fill-current" /> : <StarOff className="h-3 w-3" />}
            label="Primary"
            active={pkg.is_primary || pkg.is_default}
            activeClass="text-amber-400 bg-amber-400/8 border-amber-400/20"
          />
        )}

        {!isArchived && <ActionBtn onClick={() => onDuplicate(pkg)} icon={<Copy className="h-3 w-3" />} label="Duplicate" />}

        {/* Unarchive button for archived packages */}
        {isArchived && (
          <ActionBtn
            onClick={() => onUnarchive(pkg.id)}
            disabled={unarchivingId === pkg.id}
            icon={unarchivingId === pkg.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArchiveRestore className="h-3 w-3" />}
            label={unarchivingId === pkg.id ? 'Restoring…' : 'Unarchive'}
            highlight
          />
        )}

        {/* Archive button (non-archived packages) */}
        {!isArchived && (
          <button
            onClick={() => onArchive(pkg)}
            disabled={archivingId === pkg.id}
            className="ml-auto h-7 w-7 rounded-lg text-white/20 hover:text-white/50 hover:bg-white/8 disabled:opacity-40 transition-colors flex items-center justify-center"
            title="Archive package"
          >
            {archivingId === pkg.id
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Archive className="h-3 w-3" />
            }
          </button>
        )}
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

// Inline expandable technical details for package cards
function ExpandableCardDetails({ details }: { details: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-[9px] text-red-400/50 hover:text-red-400/80 underline underline-offset-2 transition-colors"
      >
        {open ? 'Hide details' : 'Technical details'}
      </button>
      {open && (
        <pre className="mt-1 text-[9px] text-white/30 leading-relaxed break-all whitespace-pre-wrap font-mono bg-white/3 rounded p-1.5 overflow-hidden">
          {details}
        </pre>
      )}
    </div>
  )
}

function ActionBtn({
  onClick, disabled, icon, label, highlight, active, activeClass, danger,
}: {
  onClick: () => void
  disabled?: boolean
  icon: React.ReactNode
  label: string
  highlight?: boolean
  active?: boolean
  activeClass?: string
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-7 px-2 rounded-lg text-[11px] transition-colors flex items-center gap-1 disabled:opacity-40 border ${
        danger
          ? 'text-red-400 bg-red-400/8 border-red-400/20 hover:bg-red-400/15'
          : active && activeClass
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

// ─── ExpandableErrorBlock ─────────────────────────────────────────────────────

function ExpandableErrorBlock({
  title,
  message,
  details,
}: {
  title:    string
  message:  string
  details?: string | null
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg bg-red-400/5 border border-red-400/15 p-2 space-y-1">
      <p className="text-[9px] text-red-400/60 uppercase tracking-wider">{title}</p>
      <p className="text-[10px] text-red-400/70 leading-snug break-words">{message}</p>
      {details && (
        <div>
          <button
            onClick={() => setOpen(v => !v)}
            className="text-[9px] text-red-400/50 hover:text-red-400/80 underline underline-offset-2 transition-colors"
          >
            {open ? 'Hide technical details' : 'Show technical details'}
          </button>
          {open && (
            <pre className="mt-1 text-[9px] text-white/30 leading-relaxed break-all whitespace-pre-wrap font-mono bg-white/3 rounded p-1.5 overflow-hidden">
              {details}
            </pre>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Package Detail Info ──────────────────────────────────────────────────────

function PackageDetailInfo({ pkg }: { pkg: P360Package }) {
  const pkgExt = pkg as P360Package & {
    master_frame_url?:             string | null
    master_frame_generated?:       boolean
    consistency_mode?:             string | null
    locked_generation_prompt?:     string | null
    analysis_version?:             number
    master_frame_analysis?:        Record<string, unknown> | null
    scene_blueprint?:              Record<string, unknown> | null
    generation_provider?:          string | null
    reference_image_url?:          string | null
    generation_stage?:             string | null
    provider_job_id?:              string | null
    leonardo_execution_id?:        string | null
    last_provider_error?:          string | null
    last_provider_error_details?:  string | null
    last_error_details?:           string | null
    locked_identity_blueprint?:    Record<string, unknown> | null
  }

  const providerName     = pkgExt.generation_provider ?? 'gemini'
  const providerLabel    = PROVIDER_LABELS[providerName] ?? providerName
  const hasReferenceImg  = !!(pkgExt.reference_image_url)
  const generationStage  = pkgExt.generation_stage ?? null
  const providerJobId    = pkgExt.provider_job_id ?? pkgExt.leonardo_execution_id ?? null
  const lastProvErr      = pkgExt.last_provider_error ?? null
  const lastProvErrDetails = pkgExt.last_provider_error_details ?? pkgExt.last_error_details ?? null

  // Identity blueprint (new simpler structure)
  const identityBp          = pkgExt.locked_identity_blueprint
  const hasIdentityBp        = !!(identityBp && typeof identityBp === 'object' && (identityBp as Record<string, unknown>).subject)
  const identitySubject      = hasIdentityBp ? (identityBp as Record<string, unknown>).subject as Record<string, unknown> : null
  const identityIngredients  = Array.isArray(identitySubject?.exactIngredientsOrParts)
    ? (identitySubject.exactIngredientsOrParts as string[])
    : []
  const hasMasterFrame    = !!(pkgExt.master_frame_generated && pkgExt.master_frame_url)
  const isVisionGrounded  = pkgExt.analysis_version === 2
  const hasBlueprint      = !!(pkgExt.locked_generation_prompt && pkgExt.locked_generation_prompt.length > 50)
  const consistencyMode   = pkgExt.consistency_mode ?? 'strict'
  const isUltraStrict     = consistencyMode === 'ultra_strict'

  // Extract locked scene from scene_blueprint if available
  const lockedScene       = (pkgExt.scene_blueprint?.lockedScene ?? null) as Record<string, unknown> | null
  const hasLockedSceneUI  = !!(lockedScene?.productVariant)
  const lockedVariant     = lockedScene?.productVariant as string | undefined
  const lockedFoodDetails = lockedScene?.foodDetails as Record<string, unknown> | null | undefined
  const lockedVessel      = lockedScene?.vessel as Record<string, unknown> | null | undefined
  const lockedEnv         = lockedScene?.environment as Record<string, unknown> | null | undefined
  const lockedCamera      = lockedScene?.camera as Record<string, unknown> | null | undefined
  const lockedLighting    = lockedScene?.lighting as Record<string, unknown> | null | undefined
  const toppings          = (lockedFoodDetails?.toppings ?? []) as Array<Record<string, unknown>>

  return (
    <div className="rounded-xl bg-white/3 border border-white/6 p-3 space-y-2 text-[11px]">

      {/* Provider + stage */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/6">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Provider</span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
          providerName === 'leonardo'
            ? 'text-indigo-400 bg-indigo-400/10 border-indigo-400/20'
            : 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20'
        }`}>
          {providerName === 'leonardo' ? '🎨' : '🤖'} {providerLabel}
        </span>
      </div>

      {/* Reference image */}
      {providerName === 'leonardo' && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Reference Image</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
            hasReferenceImg
              ? 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20'
              : 'text-orange-400 bg-orange-400/10 border-orange-400/20'
          }`}>
            {hasReferenceImg ? <><Check className="h-2.5 w-2.5" />Uploaded</> : 'Not uploaded'}
          </span>
        </div>
      )}

      {/* Generation stage */}
      {generationStage && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Stage</span>
          <span className="text-[10px] text-white/50 font-mono">{generationStage}</span>
        </div>
      )}

      {/* Provider job ID */}
      {providerJobId && (
        <div className="rounded-lg bg-white/3 border border-white/6 p-2">
          <p className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5">Provider Job ID</p>
          <p className="text-[10px] text-white/50 font-mono break-all">{providerJobId}</p>
        </div>
      )}

      {/* Last provider error */}
      {lastProvErr && (
        <ExpandableErrorBlock
          title="Last Provider Error"
          message={lastProvErr}
          details={lastProvErrDetails}
        />
      )}

      {/* Identity blueprint */}
      {hasIdentityBp && identitySubject && (
        <div className="rounded-lg bg-teal-400/5 border border-teal-400/15 p-2 space-y-1">
          <p className="text-[9px] text-teal-400/60 uppercase tracking-wider">Locked Identity Blueprint</p>
          <p className="text-[10px] text-white/70 font-medium">{String(identitySubject.productName ?? '')}</p>
          {identityIngredients.length > 0 && (
            <p className="text-[10px] text-white/40 leading-snug">
              {identityIngredients.slice(0, 5).join(', ')}
              {identityIngredients.length > 5 && ` +${identityIngredients.length - 5} more`}
            </p>
          )}
        </div>
      )}

      {/* Consistency mode status */}
      <div className="flex items-center justify-between pb-1.5 border-b border-white/6">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Consistency Mode</span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
          isUltraStrict
            ? 'text-orange-400 bg-orange-400/10 border-orange-400/20'
            : hasMasterFrame
            ? 'text-teal-400 bg-teal-400/10 border-teal-400/20'
            : 'text-white/30 bg-white/4 border-white/8'
        }`}>
          {isUltraStrict
            ? <><Lock className="h-2.5 w-2.5" />Ultra Strict</>
            : hasMasterFrame
            ? <><Lock className="h-2.5 w-2.5" />Strict Locked</>
            : 'Not yet locked'}
        </span>
      </div>

      {/* Ultra strict explanation */}
      {isUltraStrict && (
        <div className="rounded-lg bg-orange-400/5 border border-orange-400/15 p-2">
          <p className="text-[9px] text-orange-400/80 leading-relaxed">
            Ultra Strict locks the exact product, plate/bowl, toppings, table, wall, lighting, crop, and atmosphere.
            Only camera angle changes.
          </p>
        </div>
      )}

      {/* Locked scene contract status */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Scene Contract</span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
          hasLockedSceneUI
            ? (lockedScene?.analysisSource === 'gemini_vision_enriched'
              ? 'text-violet-400 bg-violet-400/10 border-violet-400/20'
              : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20')
            : 'text-white/30 bg-white/4 border-white/8'
        }`}>
          {hasLockedSceneUI
            ? (lockedScene?.analysisSource === 'gemini_vision_enriched'
              ? <><Sparkles className="h-2.5 w-2.5" />Vision-enriched</>
              : <><Lock className="h-2.5 w-2.5" />Locked</>)
            : 'Not built yet'}
        </span>
      </div>

      {/* Locked product variant */}
      {hasLockedSceneUI && lockedVariant && (
        <div className="rounded-lg bg-emerald-400/5 border border-emerald-400/15 p-2 space-y-1">
          <p className="text-[9px] text-emerald-400/60 uppercase tracking-wider">Locked Product Variant</p>
          <p className="text-[10px] text-white/80 font-medium leading-snug">{lockedVariant}</p>
        </div>
      )}

      {/* Locked toppings / food details */}
      {lockedFoodDetails && toppings.length > 0 && (
        <div className="rounded-lg bg-white/3 border border-white/6 p-2 space-y-1">
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Locked Toppings / Ingredients</p>
          <div className="space-y-0.5">
            {toppings.slice(0, 8).map((t, i) => (
              <p key={i} className="text-[10px] text-white/50">
                <span className="text-white/70">•</span> {String(t.name ?? '')}
                {t.count ? <span className="text-white/30"> — {String(t.count)}</span> : null}
              </p>
            ))}
            {toppings.length > 8 && (
              <p className="text-[9px] text-white/30">+{toppings.length - 8} more</p>
            )}
          </div>
        </div>
      )}

      {/* Locked vessel + environment */}
      {hasLockedSceneUI && (lockedVessel || lockedEnv) && (
        <div className="rounded-lg bg-white/3 border border-white/6 p-2 space-y-1">
          <p className="text-[9px] text-white/30 uppercase tracking-wider">Locked Scene Variables</p>
          {!!(lockedVessel?.type) && (
            <p className="text-[10px] text-white/50">
              <span className="text-white/30">Vessel</span> {String(lockedVessel!.color ?? '')} {String(lockedVessel!.type ?? '')}
            </p>
          )}
          {!!(lockedEnv?.tableSurfaceType) && (
            <p className="text-[10px] text-white/50">
              <span className="text-white/30">Table</span> {String(lockedEnv!.tableSurfaceType)} {String(lockedEnv!.tableSurfaceColor ?? '')}
            </p>
          )}
          {!!(lockedEnv?.wallOrBackgroundColor) && (
            <p className="text-[10px] text-white/50">
              <span className="text-white/30">Background</span> {String(lockedEnv!.wallOrBackgroundColor)}
            </p>
          )}
          {!!(lockedLighting?.keyLightPosition) && (
            <p className="text-[10px] text-white/50">
              <span className="text-white/30">Lighting</span> {String(lockedLighting!.keyLightPosition)}
            </p>
          )}
          {!!(lockedCamera?.zoom) && (
            <p className="text-[10px] text-white/50">
              <span className="text-white/30">Crop/Zoom</span> {String(lockedCamera!.zoom)}
            </p>
          )}
        </div>
      )}

      {/* Blueprint status row */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-white/30 uppercase tracking-wider">Blueprint</span>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
          isVisionGrounded
            ? 'text-violet-400 bg-violet-400/10 border-violet-400/20'
            : hasBlueprint
            ? 'text-sky-400 bg-sky-400/10 border-sky-400/20'
            : 'text-white/30 bg-white/4 border-white/8'
        }`}>
          {isVisionGrounded
            ? <><Sparkles className="h-2.5 w-2.5" />Vision-grounded</>
            : hasBlueprint
            ? <><Lock className="h-2.5 w-2.5" />Text-based</>
            : 'Not built yet'}
        </span>
      </div>

      {/* Vision analysis vessel detail */}
      {isVisionGrounded && !!pkgExt.master_frame_analysis?.vesselExact && (
        <div className="rounded-lg bg-violet-400/5 border border-violet-400/15 p-2 space-y-0.5">
          <p className="text-[9px] text-violet-400/60 uppercase tracking-wider">Locked vessel (from vision)</p>
          <p className="text-[10px] text-white/50 line-clamp-2">
            {pkgExt.master_frame_analysis!.vesselExact as string}
          </p>
        </div>
      )}

      {/* Master frame thumbnail */}
      {hasMasterFrame && (
        <div className="space-y-1">
          <p className="text-[10px] text-white/30 uppercase tracking-wider flex items-center gap-1">
            <Sparkles className="h-2.5 w-2.5" />
            Master Frame
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={pkgExt.master_frame_url!}
            alt="Master reference frame (0° front view)"
            className="w-full rounded-lg border border-teal-400/20 object-cover aspect-square"
          />
          <p className="text-[9px] text-teal-400/60 text-center">
            0° front view — visual anchor for all frames
            {isVisionGrounded && ' · Gemini-analyzed ✓'}
          </p>
        </div>
      )}

      <Row label="AI Model"     value={pkg.ai_model ?? 'imagen-4.0-ultra-generate-001'} />
      <Row label="Type"         value={pkg.package_type.replace(/_/g, ' ')} />
      <Row label="Frames"       value={`${pkg.frame_count} / ${pkg.target_frame_count}`} />
      {pkg.lighting_preset    && <Row label="Lighting"    value={pkg.lighting_preset.replace(/_/g, ' ')} />}
      {pkg.background_preset  && <Row label="Background"  value={pkg.background_preset.replace(/_/g, ' ')} />}
      {pkg.camera_preset      && <Row label="Camera"      value={pkg.camera_preset.replace(/_/g, ' ')} />}
      {pkg.turn_direction     && <Row label="Direction"   value={pkg.turn_direction.replace(/_/g, ' ')} />}

      {pkgExt.locked_generation_prompt && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1 flex items-center gap-1">
            <Lock className="h-2.5 w-2.5" />
            Locked Scene Spec
          </p>
          <p className="text-white/30 line-clamp-3 text-[10px] font-mono bg-white/3 rounded p-2">
            {pkgExt.locked_generation_prompt.slice(0, 200)}…
          </p>
        </div>
      )}

      {pkg.generation_prompt && (
        <div>
          <p className="text-[10px] text-white/30 uppercase tracking-wider mb-1">Custom Prompt</p>
          <p className="text-white/50 line-clamp-3">{pkg.generation_prompt}</p>
        </div>
      )}
      {pkg.promo_starts_at && <Row label="Promo start" value={new Date(pkg.promo_starts_at).toLocaleDateString()} />}
      {pkg.promo_ends_at   && <Row label="Promo end"   value={new Date(pkg.promo_ends_at).toLocaleDateString()} />}
    </div>
  )
}

// ─── Frame Status Grid ────────────────────────────────────────────────────────

const FRAME_STATUS_STYLES: Record<string, string> = {
  pending:    'bg-white/10 border-white/15',
  queued:     'bg-sky-400/20 border-sky-400/30',
  generating: 'bg-amber-400/20 border-amber-400/30',
  completed:  'bg-emerald-400/20 border-emerald-400/30',
  failed:     'bg-red-400/20 border-red-400/30',
  cancelled:  'bg-white/8 border-white/10',
  skipped:    'bg-white/6 border-white/8',
  archived:   'bg-white/4 border-white/6',
}

const FRAME_STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', queued: 'Queued', generating: 'Generating',
  completed: 'Done', failed: 'Failed', cancelled: 'Stopped',
  skipped: 'Skipped', archived: 'Archived',
}

// ─── Debug Panel ─────────────────────────────────────────────────────────────

function PackageDebugPanel({ pkg }: { pkg: P360Package & { frames: P360Frame[] } }) {
  const [open, setOpen] = useState(false)

  const framesByStatus = pkg.frames.reduce<Record<string, number>>((acc, f) => {
    const st = (f.status as string) || (f.image_url ? 'completed' : 'pending')
    acc[st] = (acc[st] ?? 0) + 1
    return acc
  }, {})

  const rows: [string, string | number | boolean | null | undefined][] = [
    ['Package ID',             pkg.id],
    ['Product ID',             pkg.product_id],
    ['Tenant ID',              pkg.tenant_id],
    ['Status',                 pkg.status],
    ['cancel_requested',       String(pkg.cancel_requested ?? false)],
    ['frames_done',            pkg.frames_done ?? 0],
    ['progress_percent',       `${pkg.progress_percent ?? 0}%`],
    ['target_frame_count',     pkg.target_frame_count ?? 0],
    ['actual frame rows',      pkg.frames.length],
    ['queued frames',          framesByStatus.queued ?? 0],
    ['generating frames',      framesByStatus.generating ?? 0],
    ['completed frames',       framesByStatus.completed ?? 0],
    ['failed frames',          framesByStatus.failed ?? 0],
    ['last_error_type',        pkg.last_error_type ?? '—'],
    ['last_error_message',     pkg.last_error_message ?? '—'],
    ['generation_started_at',  pkg.generation_started_at ?? '—'],
    ['generation_completed_at',pkg.generation_completed_at ?? '—'],
    ['last_generated_at',      pkg.last_generated_at ?? '—'],
    ['last_generation_heartbeat', pkg.last_generation_heartbeat ?? '—'],
    ['next_retry_at',          pkg.next_retry_at ?? '—'],
    ['provider / model',       `${pkg.generation_provider ?? '—'} / ${pkg.ai_model ?? '—'}`],
  ]

  return (
    <div className="rounded-xl bg-white/3 border border-white/6 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-white/30 uppercase tracking-wider hover:text-white/50 transition-colors"
      >
        <span>Debug / Diagnostic</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2 text-[10px]">
              <span className="text-white/30 w-44 shrink-0">{label}</span>
              <span className="text-white/60 break-all font-mono">{String(value ?? '—')}</span>
            </div>
          ))}
          {pkg.generation_error && (
            <div className="mt-2 rounded-lg bg-red-500/8 border border-red-500/15 px-2 py-1.5">
              <p className="text-[10px] text-red-400 font-mono break-all">{pkg.generation_error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function FrameStatusGrid({ frames }: { frames: P360Frame[] }) {
  const [frameFilter, setFrameFilter] = useState<string>('all')
  if (!frames.length) return null

  const statusCounts = frames.reduce<Record<string, number>>((acc, f) => {
    const st = (f.status as string) || (f.image_url ? 'completed' : 'pending')
    acc[st] = (acc[st] ?? 0) + 1
    return acc
  }, {})

  const filtered = frames.filter(f => {
    const st = (f.status as string) || (f.image_url ? 'completed' : 'pending')
    return frameFilter === 'all' || st === frameFilter
  })

  return (
    <div className="rounded-xl bg-white/3 border border-white/6 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <p className="text-[10px] text-white/30 uppercase tracking-wider">Frames</p>
        <span className="text-[10px] text-white/30">{frames.length} total</span>
      </div>

      {/* Status filter chips */}
      <div className="flex items-center gap-1 flex-wrap">
        <button
          onClick={() => setFrameFilter('all')}
          className={`h-5 px-2 rounded-full text-[9px] border transition-colors ${frameFilter === 'all' ? 'text-fuchsia-400 bg-fuchsia-400/10 border-fuchsia-400/20' : 'text-white/30 bg-white/4 border-white/8 hover:text-white'}`}
        >All</button>
        {Object.entries(statusCounts).map(([st, cnt]) => (
          <button
            key={st}
            onClick={() => setFrameFilter(st)}
            className={`h-5 px-2 rounded-full text-[9px] border transition-colors ${frameFilter === st ? 'text-white/70 bg-white/10 border-white/20' : 'text-white/25 bg-white/3 border-white/6 hover:text-white'}`}
          >
            {FRAME_STATUS_LABELS[st] ?? st} {cnt}
          </button>
        ))}
      </div>

      {/* Thumbnail grid */}
      <div className="grid grid-cols-6 gap-1">
        {filtered.slice(0, 48).map(f => {
          const st = (f.status as P360FrameStatus) || (f.image_url ? 'completed' : 'pending')
          return (
            <div
              key={f.id}
              className={`relative rounded border aspect-square overflow-hidden ${FRAME_STATUS_STYLES[st] ?? FRAME_STATUS_STYLES.pending}`}
              title={`Frame ${f.frame_index}${f.angle_degrees != null ? ` · ${f.angle_degrees}°` : ''} · ${FRAME_STATUS_LABELS[st] ?? st}${(f as P360Frame & { generation_attempt?: number }).generation_attempt != null && (f as P360Frame & { generation_attempt?: number }).generation_attempt! > 1 ? ` · Attempt ${(f as P360Frame & { generation_attempt?: number }).generation_attempt}` : ''}${(f as P360Frame & { is_master_frame?: boolean }).is_master_frame ? ' · MASTER' : ''}`}
            >
              {f.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.image_url} alt={`Frame ${f.frame_index}`} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <span className="text-[8px] text-white/30 font-mono">{f.frame_index}</span>
                </div>
              )}
              {/* Master frame crown indicator */}
              {(f as P360Frame & { is_master_frame?: boolean }).is_master_frame && f.image_url && (
                <div className="absolute top-0.5 left-0.5 h-3 w-3 flex items-center justify-center rounded-full bg-amber-400/80" title="Master reference frame">
                  <span className="text-[6px]">★</span>
                </div>
              )}
              {/* Retry indicator — shown when frame needed more than 1 attempt */}
              {(f as P360Frame & { generation_attempt?: number }).generation_attempt != null &&
               (f as P360Frame & { generation_attempt?: number }).generation_attempt! > 1 && (
                <div className="absolute bottom-0.5 right-0.5 bg-orange-400/80 rounded-full h-3 w-3 flex items-center justify-center" title={`Generated on attempt ${(f as P360Frame & { generation_attempt?: number }).generation_attempt}`}>
                  <span className="text-[6px] font-bold">{(f as P360Frame & { generation_attempt?: number }).generation_attempt}</span>
                </div>
              )}
              {/* Consistency score indicator — shown when validation ran */}
              {(f as P360Frame & { consistency_score?: number | null }).consistency_score != null && (
                <div
                  className={`absolute top-0.5 right-0.5 h-2.5 w-2.5 rounded-full border border-black/20 ${
                    (f as P360Frame & { consistency_score?: number }).consistency_score! >= 0.8
                      ? 'bg-emerald-400'
                      : (f as P360Frame & { consistency_score?: number }).consistency_score! >= 0.5
                      ? 'bg-amber-400'
                      : 'bg-red-400'
                  }`}
                  title={`Consistency: ${Math.round(((f as P360Frame & { consistency_score?: number }).consistency_score ?? 0) * 100)}%`}
                />
              )}
              {/* Drift warning indicator */}
              {(f as P360Frame & { error_message?: string | null }).error_message && (
                <div className="absolute bottom-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-red-500/80 flex items-center justify-center border border-black/20"
                  title={(f as P360Frame & { error_message?: string }).error_message ?? 'Consistency issue'}>
                  <span className="text-[5px] font-bold text-white">!</span>
                </div>
              )}
              {/* Status dot overlay for non-completed frames */}
              {st !== 'completed' && (
                <div className={`absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full ${
                  st === 'generating' ? 'bg-amber-400 animate-pulse'
                  : st === 'failed' ? 'bg-red-400'
                  : st === 'queued' ? 'bg-sky-400'
                  : 'bg-white/30'
                }`} />
              )}
            </div>
          )
        })}
      </div>
      {filtered.length > 48 && (
        <p className="text-[10px] text-white/30 text-center">+{filtered.length - 48} more frames</p>
      )}
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
  const [preset,     setPreset]     = useState('')
  const [isPrimary,  setIsPrimary]  = useState(false)
  const [prompt,     setPrompt]     = useState('')
  const [notes,      setNotes]      = useState('')
  const [type,       setType]       = useState<'ai_generated' | 'uploaded_frames'>('ai_generated')
  const [frames,     setFrames]     = useState(36)
  const [provider,   setProvider]   = useState<'gemini' | 'leonardo'>(
    (process.env.NEXT_PUBLIC_360_DEFAULT_PROVIDER as 'gemini' | 'leonardo' | undefined) ?? 'gemini',
  )
  const [refImageFile,    setRefImageFile]    = useState<File | null>(null)
  const [refImagePreview, setRefImagePreview] = useState<string | null>(null)
  const refImageInputRef = useRef<HTMLInputElement>(null)
  const [lighting,   setLighting]   = useState('')
  const [background, setBackground] = useState('')
  const [category,   setCategory]   = useState('')
  const [camera,     setCamera]     = useState('')
  const [direction,        setDirection]        = useState<'clockwise' | 'counter_clockwise'>('clockwise')
  const [consistencyMode_, setConsistencyMode_] = useState<'standard' | 'strict' | 'ultra_strict'>('ultra_strict')
  const [shadow,           setShadow]           = useState(0.5)
  const [reflection,       setReflection]       = useState(0.3)
  const [promoTag,         setPromoTag]         = useState('')
  const [showPresets,      setShowPresets]       = useState(false)

  const [creating,     setCreating]     = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [errorTitle,   setErrorTitle]   = useState<string | null>(null)
  const [errorDetails, setErrorDetails] = useState<string | null>(null)
  const [fieldError,   setFieldError]   = useState<Record<string, string>>({})

  function clearErrors() {
    setError(null)
    setErrorTitle(null)
    setErrorDetails(null)
    setFieldError({})
  }

  async function handleSubmit() {
    if (!product || !name.trim()) {
      setFieldError({ ...((!product) ? { productId: 'Please select a product.' } : {}), ...((!name.trim()) ? { name: 'Please enter a package name.' } : {}) })
      return
    }
    setCreating(true)
    clearErrors()
    try {
      const res = await fetch('/api/product-360/packages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId,
          productId:              product,
          name:                   name.trim(),
          description:            desc.trim()    || undefined,
          preset:                 preset.trim()  || null,
          is_primary:             isPrimary,
          packageType:            type,
          generationPrompt:       prompt.trim()  || undefined,
          generationNotes:        notes.trim()   || undefined,
          targetFrameCount:       frames,
          lightingPreset:         lighting    || null,
          backgroundPreset:       background  || null,
          categoryPreset:         category    || null,
          cameraPreset:           camera      || null,
          turnDirection:          direction,
          consistencyMode:        consistencyMode_,
          shadowStrength:         shadow,
          reflectionIntensity:    reflection,
          promoTag:               promoTag.trim() || null,
          generationProvider:     provider,
          referenceImageRequired: provider === 'leonardo' && !refImageFile ? false : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        const apiErr = json.error
        if (apiErr && typeof apiErr === 'object') {
          setErrorTitle(apiErr.title ?? 'Package creation failed')
          setError(apiErr.message ?? 'An error occurred.')
          if (apiErr.details) setErrorDetails(apiErr.details)
          if (apiErr.field)   setFieldError({ [apiErr.field]: apiErr.message ?? 'Invalid value' })
        } else {
          setErrorTitle('Package creation failed')
          setError(typeof apiErr === 'string' ? apiErr : 'An unknown error occurred.')
        }
        return
      }
      const pkg = json.data?.package ?? json.package

      // Upload reference image if provided
      if (refImageFile && pkg?.id) {
        try {
          const fd = new FormData()
          fd.append('image', refImageFile)
          const upRes = await fetch(`/api/product-360/packages/${pkg.id}/upload-reference`, {
            method: 'POST',
            body:   fd,
          })
          if (!upRes.ok) {
            const upJson = await upRes.json().catch(() => ({}))
            console.warn('Reference image upload failed:', upJson)
            setError(`Package created, but reference image upload failed: ${upJson?.error?.message ?? 'Unknown error'}`)
          }
        } catch (upErr) {
          console.warn('Reference image upload error:', upErr)
        }
      }

      onCreated({ ...pkg, frames_done: 0, product_name: products.find(p => p.id === product)?.name ?? null })
    } catch {
      setErrorTitle('Network error')
      setError('Could not reach the server. Please check your connection and try again.')
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
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 p-3.5 space-y-1">
            {errorTitle && <p className="text-xs font-semibold text-red-400">{errorTitle}</p>}
            <p className="text-xs text-red-400/80">{error}</p>
            {errorDetails && (
              <details className="mt-1">
                <summary className="text-[10px] text-red-400/50 cursor-pointer hover:text-red-400/70 select-none">
                  Technical details
                </summary>
                <p className="mt-1 text-[10px] font-mono text-red-400/40 break-all">{errorDetails}</p>
              </details>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Product */}
          <Field label="Product" className="sm:col-span-2">
            <select value={product} onChange={e => { setProduct(e.target.value); setFieldError(fe => ({ ...fe, productId: '' })) }}
              className={`store-input ${fieldError.productId ? 'border-red-500/40' : ''}`}>
              <option value="">Select a product…</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            {fieldError.productId && <p className="text-[10px] text-red-400 mt-1">{fieldError.productId}</p>}
          </Field>

          {/* Name */}
          <Field label="Package Name">
            <input type="text" value={name} onChange={e => { setName(e.target.value); setFieldError(fe => ({ ...fe, name: '' })) }}
              placeholder="e.g. Standard View, Summer Promo…"
              className={`store-input ${fieldError.name ? 'border-red-500/40' : ''}`} />
            {fieldError.name && <p className="text-[10px] text-red-400 mt-1">{fieldError.name}</p>}
          </Field>

          {/* Description */}
          <Field label="Description">
            <input type="text" value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Optional description" className="store-input" />
          </Field>

          {/* Preset label */}
          <Field label="Preset Label">
            <input type="text" value={preset} onChange={e => setPreset(e.target.value)}
              placeholder="e.g. standard, premium, holiday…" className="store-input" />
          </Field>

          {/* Primary flag */}
          <Field label="Set as Primary">
            <label className="flex items-center gap-2.5 cursor-pointer h-9 px-3 rounded-xl bg-white/4 border border-white/8 select-none">
              <input
                type="checkbox"
                checked={isPrimary}
                onChange={e => setIsPrimary(e.target.checked)}
                className="w-3.5 h-3.5 rounded accent-fuchsia-400"
              />
              <span className="text-xs text-white/60">Make this the primary package for the product</span>
            </label>
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
                  {t === 'ai_generated' ? '⚡ AI Generated' : '📁 Manual Upload'}
                </button>
              ))}
            </div>
          </Field>

          {/* AI Provider selector */}
          {type === 'ai_generated' && (
            <Field label="AI Provider" className="sm:col-span-2">
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'gemini',   label: 'Gemini / Imagen',  desc: 'Text-prompt generation, no reference required' },
                  { value: 'leonardo', label: 'Leonardo AI',       desc: 'Blueprint Executions with reference image' },
                ] as const).map(p => (
                  <button key={p.value} type="button" onClick={() => setProvider(p.value)}
                    className={`h-auto py-2.5 px-3 rounded-xl text-xs font-medium border transition-colors flex flex-col items-start gap-0.5 ${
                      provider === p.value
                        ? (p.value === 'leonardo'
                          ? 'bg-indigo-400/10 border-indigo-400/30 text-indigo-400'
                          : 'bg-fuchsia-400/10 border-fuchsia-400/30 text-fuchsia-400')
                        : 'bg-white/4 border-white/8 text-white/40 hover:text-white hover:bg-white/8'
                    }`}>
                    <span>{p.value === 'gemini' ? '🤖' : '🎨'} {p.label}</span>
                    <span className="text-[9px] font-normal opacity-60 leading-tight">{p.desc}</span>
                  </button>
                ))}
              </div>
              {provider === 'leonardo' && (
                <p className="text-[10px] text-indigo-400/70 mt-1.5 leading-relaxed">
                  Leonardo uses Blueprint Executions. Uploading a reference photo produces much more consistent 360° frames — strongly recommended.
                </p>
              )}
            </Field>
          )}

          {/* Reference image upload */}
          {type === 'ai_generated' && (
            <Field label={provider === 'leonardo' ? 'Reference Image (Strongly Recommended)' : 'Reference Image (Optional)'} className="sm:col-span-2">
              <input
                ref={refImageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0] ?? null
                  setRefImageFile(file)
                  if (file) {
                    const reader = new FileReader()
                    reader.onload = ev => setRefImagePreview(ev.target?.result as string)
                    reader.readAsDataURL(file)
                  } else {
                    setRefImagePreview(null)
                  }
                }}
              />
              {refImagePreview ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={refImagePreview} alt="Reference" className="w-16 h-16 rounded-xl object-cover border border-white/10" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/60 truncate">{refImageFile?.name}</p>
                    <p className="text-[10px] text-white/30">{refImageFile ? `${Math.round(refImageFile.size / 1024)} KB` : ''}</p>
                    <button type="button" onClick={() => { setRefImageFile(null); setRefImagePreview(null); if (refImageInputRef.current) refImageInputRef.current.value = '' }}
                      className="mt-1 text-[10px] text-red-400/60 hover:text-red-400 transition-colors">Remove</button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => refImageInputRef.current?.click()}
                  className={`w-full h-16 rounded-xl border-2 border-dashed flex items-center justify-center gap-2 text-xs transition-colors ${
                    provider === 'leonardo'
                      ? 'border-indigo-400/30 text-indigo-400/60 hover:border-indigo-400/60 hover:text-indigo-400'
                      : 'border-white/12 text-white/30 hover:border-white/25 hover:text-white/50'
                  }`}>
                  <Upload className="h-4 w-4" />
                  {provider === 'leonardo' ? 'Upload reference photo of your product' : 'Upload reference image (optional)'}
                </button>
              )}
            </Field>
          )}

          {/* Consistency Mode */}
          {type === 'ai_generated' && (
            <Field label="Consistency Mode" className="sm:col-span-2">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { value: 'standard',     label: 'Standard',     desc: 'Basic prompt locking' },
                  { value: 'strict',       label: 'Strict',       desc: 'Stronger prompts + master frame' },
                  { value: 'ultra_strict', label: 'Ultra Strict', desc: 'Locked scene contract + drift detection' },
                ] as const).map(m => (
                  <button key={m.value} type="button" onClick={() => setConsistencyMode_(m.value)}
                    className={`h-auto py-2 px-2.5 rounded-xl text-xs font-medium border transition-colors flex flex-col items-start gap-0.5 ${
                      consistencyMode_ === m.value
                        ? (m.value === 'ultra_strict'
                          ? 'bg-orange-400/10 border-orange-400/30 text-orange-400'
                          : 'bg-fuchsia-400/10 border-fuchsia-400/30 text-fuchsia-400')
                        : 'bg-white/4 border-white/8 text-white/40 hover:text-white hover:bg-white/8'
                    }`}>
                    <span>{m.value === 'ultra_strict' ? '🔒 ' : ''}{m.label}</span>
                    <span className="text-[9px] font-normal opacity-60 leading-tight">{m.desc}</span>
                  </button>
                ))}
              </div>
              {consistencyMode_ === 'ultra_strict' && (
                <p className="text-[10px] text-orange-400/70 mt-1.5 leading-relaxed">
                  Ultra Strict locks the exact product, plate/bowl, toppings, table, wall, lighting, crop, and atmosphere.
                  Only camera angle changes. Recommended for food.
                </p>
              )}
            </Field>
          )}

          {/* Camera preset → frames */}
          <Field label="Camera Preset">
            <select value={camera} onChange={e => {
              setCamera(e.target.value)
              setFieldError(fe => ({ ...fe, camera_preset: '' }))
              if (e.target.value.includes('18')) setFrames(18)
              else if (e.target.value.includes('24')) setFrames(24)
              else if (e.target.value.includes('36')) setFrames(36)
            }} className={`store-input ${fieldError.camera_preset ? 'border-red-500/40' : ''}`}>
              <option value="">Choose preset…</option>
              {CAMERA_PRESETS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
            </select>
            {fieldError.camera_preset && <p className="text-[10px] text-red-400 mt-1">{fieldError.camera_preset}</p>}
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
                  <select value={lighting} onChange={e => { setLighting(e.target.value); setFieldError(fe => ({ ...fe, lighting_preset: '' })) }}
                    className={`store-input ${fieldError.lighting_preset ? 'border-red-500/40' : ''}`}>
                    <option value="">Auto</option>
                    {LIGHTING_PRESETS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                  </select>
                  {fieldError.lighting_preset && <p className="text-[10px] text-red-400 mt-1">{fieldError.lighting_preset}</p>}
                </Field>
                <Field label="Background">
                  <select value={background} onChange={e => { setBackground(e.target.value); setFieldError(fe => ({ ...fe, background_preset: '' })) }}
                    className={`store-input ${fieldError.background_preset ? 'border-red-500/40' : ''}`}>
                    <option value="">Auto</option>
                    {BACKGROUND_PRESETS.map(p => <option key={p.value} value={p.value}>{p.icon} {p.label}</option>)}
                  </select>
                  {fieldError.background_preset && <p className="text-[10px] text-red-400 mt-1">{fieldError.background_preset}</p>}
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
