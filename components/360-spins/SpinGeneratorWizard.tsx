'use client'
// components/360-spins/SpinGeneratorWizard.tsx
// 5-step wizard for creating and managing 360° product spin sets.
// Designed for the /dashboard/360-spins owner / admin page.

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChevronRight, Check, RotateCcw, AlertCircle, Loader2, Layers, Zap, Package } from 'lucide-react'
import SpinViewer360Lazy from '@/components/SpinViewer360/SpinViewer360Lazy'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Tenant  { id: string; name: string; slug: string }
interface Product { id: string; name: string; description: string | null; spin_360_id: string | null }

interface Spin360 {
  id:            string
  name:          string
  prompt:        string
  status:        'generating' | 'ready' | 'failed'
  image_urls:    string[]
  total_frames:  number
  product_id:    string
  created_at:    string
  error_message: string | null
  frames_done?:  number
  frames_total?: number
}

interface WizardState {
  tenant:       Tenant  | null
  product:      Product | null
  spinName:     string
  description:  string
  frameCount:   number
}

// ─── Step indicator ───────────────────────────────────────────────────────────

const STEP_LABELS = ['Business', 'Product', 'Configure', 'Generate', 'Review']

function StepBar({ current, maxReached }: { current: number; maxReached: number }) {
  return (
    <div className="flex items-center gap-0 mb-8">
      {STEP_LABELS.map((label, i) => {
        const done   = i < current
        const active = i === current
        const locked = i > maxReached

        return (
          <div key={label} className="flex items-center flex-1 min-w-0">
            <div className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                done   ? 'bg-indigo-500 border-indigo-500 text-white'   :
                active ? 'border-indigo-500 text-indigo-400 bg-transparent' :
                         'border-zinc-700 text-zinc-600 bg-transparent'
              }`}>
                {done ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-[10px] font-medium tracking-wide whitespace-nowrap hidden sm:block ${
                active ? 'text-white' : done ? 'text-indigo-400' : 'text-zinc-600'
              }`}>
                {label}
              </span>
            </div>

            {i < STEP_LABELS.length - 1 && (
              <div className={`flex-1 h-px mx-2 transition-colors duration-300 ${
                locked ? 'bg-zinc-800' : 'bg-indigo-500/40'
              }`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast { id: number; type: 'success' | 'error'; message: string }

function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef               = useRef(0)

  const push = useCallback((type: Toast['type'], message: string) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, type, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
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

// ─── Step 1 — Business ───────────────────────────────────────────────────────

function Step1Business({
  selected, onSelect,
}: { selected: Tenant | null; onSelect: (t: Tenant) => void }) {
  const [tenants,  setTenants]  = useState<Tenant[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    fetch('/api/owner/tenants')
      .then(r => r.json())
      .then(d => setTenants(d.tenants ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Select Business</h2>
        <p className="text-sm text-zinc-400">Choose the tenant whose product you want to spin.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
          <Loader2 size={16} className="animate-spin" /> Loading businesses…
        </div>
      ) : tenants.length === 0 ? (
        <p className="text-zinc-500 text-sm py-4">No active businesses found.</p>
      ) : (
        <div className="grid gap-2">
          {tenants.map(t => (
            <button
              key={t.id}
              onClick={() => onSelect(t)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:border-indigo-500/50 ${
                selected?.id === t.id
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800'
              }`}
            >
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${
                selected?.id === t.id ? 'bg-indigo-500/20' : 'bg-zinc-700'
              }`}>
                <Package size={18} className={selected?.id === t.id ? 'text-indigo-400' : 'text-zinc-400'} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-white truncate">{t.name}</p>
                <p className="text-xs text-zinc-500 truncate">{t.slug}</p>
              </div>
              {selected?.id === t.id && (
                <Check size={16} className="ml-auto shrink-0 text-indigo-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 2 — Product ────────────────────────────────────────────────────────

function Step2Product({
  tenantId, selected, onSelect,
}: { tenantId: string; selected: Product | null; onSelect: (p: Product) => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/store/products?tenant_id=${tenantId}`)
      .then(r => r.json())
      .then(d => setProducts(d.products ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [tenantId])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Select Product</h2>
        <p className="text-sm text-zinc-400">Choose the product to create a 360° spin for.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-zinc-500 text-sm py-4">
          <Loader2 size={16} className="animate-spin" /> Loading products…
        </div>
      ) : products.length === 0 ? (
        <p className="text-zinc-500 text-sm py-4">No products found for this business.</p>
      ) : (
        <div className="grid gap-2 max-h-96 overflow-y-auto pr-1">
          {products.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p)}
              className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-all hover:border-indigo-500/50 ${
                selected?.id === p.id
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-zinc-700 bg-zinc-800/50 hover:bg-zinc-800'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white truncate">{p.name}</p>
                  {p.spin_360_id && (
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400 font-medium shrink-0">
                      Has spin
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-zinc-500 mt-0.5 truncate">{p.description}</p>
                )}
              </div>
              {selected?.id === p.id && (
                <Check size={16} className="shrink-0 text-indigo-400" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Step 3 — Configure ──────────────────────────────────────────────────────

const FRAME_OPTIONS = [
  { count: 12, label: '12 frames', detail: '30° each · Fast' },
  { count: 24, label: '24 frames', detail: '15° each · Recommended' },
  { count: 36, label: '36 frames', detail: '10° each · Smooth' },
]

function Step3Configure({
  product,
  state,
  onChange,
}: {
  product:  Product
  state:    { spinName: string; description: string; frameCount: number }
  onChange: (k: keyof typeof state, v: string | number) => void
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Configure Spin</h2>
        <p className="text-sm text-zinc-400">
          Describe <strong className="text-white">{product.name}</strong> in detail — this drives the AI consistency.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">Spin Name</label>
        <input
          type="text"
          value={state.spinName}
          onChange={e => onChange('spinName', e.target.value)}
          placeholder={`${product.name} — 360° Spin`}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-1.5">
          Product Description
          <span className="ml-1.5 text-zinc-600">(used as AI prompt)</span>
        </label>
        <textarea
          rows={4}
          value={state.description}
          onChange={e => onChange('description', e.target.value)}
          placeholder={`e.g. "${product.name} — matte black aluminum body, hexagonal cap, premium grooming product, sharp modern design…"`}
          className="w-full rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
        />
        <p className="mt-1.5 text-[11px] text-zinc-600">
          More detail = more consistent frames. Include material, color, shape, and finish.
        </p>
      </div>

      <div>
        <label className="block text-xs font-medium text-zinc-400 mb-2">Frame Count</label>
        <div className="grid grid-cols-3 gap-2">
          {FRAME_OPTIONS.map(({ count, label, detail }) => (
            <button
              key={count}
              onClick={() => onChange('frameCount', count)}
              className={`rounded-xl border p-3 text-left transition-all ${
                state.frameCount === count
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-zinc-700 bg-zinc-800/50 hover:border-zinc-600'
              }`}
            >
              <p className={`text-sm font-semibold ${state.frameCount === count ? 'text-indigo-400' : 'text-white'}`}>
                {label}
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">{detail}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Prompt preview */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300 transition-colors select-none">
          Preview AI prompt →
        </summary>
        <div className="mt-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-3">
          <p className="text-[11px] text-zinc-400 leading-relaxed font-mono">
            Ultra realistic studio product photography of{' '}
            <span className="text-indigo-300">{product.name} — {state.description || '…'}</span>,
            {' '}centered, isolated, pure white background, consistent controlled lighting,
            same scale, same 85mm lens, same framing…
            rotational angle <span className="text-amber-300">0°–345°</span> around vertical axis
          </p>
        </div>
      </details>
    </div>
  )
}

// ─── Step 4 — Generate ───────────────────────────────────────────────────────

function Step4Generate({
  tenantId,
  product,
  spinName,
  description,
  frameCount,
  onComplete,
  toast,
}: {
  tenantId:    string
  product:     Product
  spinName:    string
  description: string
  frameCount:  number
  onComplete:  (spin: Spin360) => void
  toast:       (type: 'success' | 'error', msg: string) => void
}) {
  const [spin,     setSpin]     = useState<Spin360 | null>(null)
  const [started,  setStarted]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const pollRef                 = useRef<ReturnType<typeof setInterval> | null>(null)

  const stopPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current)
  }, [])

  const pollStatus = useCallback(async (spinId: string) => {
    try {
      const r    = await fetch(`/api/ai/generate-360/${spinId}`)
      const data = await r.json()
      if (!r.ok) return

      const updated: Spin360 = data.spin
      setSpin(updated)

      if (updated.status === 'ready') {
        stopPolling()
        toast('success', '360° spin generated successfully!')
        onComplete(updated)
      } else if (updated.status === 'failed') {
        stopPolling()
        setError(updated.error_message ?? 'Generation failed')
        toast('error', 'Generation failed — see error details')
      }
    } catch { /* network transient — keep polling */ }
  }, [stopPolling, onComplete, toast])

  const handleGenerate = useCallback(async () => {
    setError(null)
    setStarted(true)

    // 1. Create the spin record
    const createRes = await fetch('/api/ai/generate-360', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        tenant_id:    tenantId,
        product_id:   product.id,
        product_name: product.name,
        description,
        angle_count:  frameCount,
        name:         spinName || undefined,
      }),
    })

    const createData = await createRes.json()
    if (!createRes.ok) {
      setError(createData.error ?? 'Failed to create spin record')
      setStarted(false)
      return
    }

    const spinId     = createData.id
    const initialSpin: Spin360 = {
      id:            spinId,
      name:          spinName || `${product.name} — 360° Spin`,
      prompt:        description,
      status:        'generating',
      image_urls:    [],
      total_frames:  frameCount,
      product_id:    product.id,
      created_at:    new Date().toISOString(),
      error_message: null,
      frames_done:   0,
      frames_total:  frameCount,
    }
    setSpin(initialSpin)

    // 2. Fire-and-forget the run endpoint
    fetch(`/api/ai/generate-360/${spinId}/run`, {
      method: 'POST',
    }).catch(err => console.warn('[SpinGenerator] run endpoint error:', err))

    // 3. Poll for status every 5s
    pollRef.current = setInterval(() => pollStatus(spinId), 5_000)
  }, [tenantId, product, description, frameCount, spinName, pollStatus])

  const handleRetry = useCallback(async () => {
    if (!spin) return
    setError(null)

    // Reset status in DB (just re-run)
    const r = await fetch(`/api/ai/generate-360/${spin.id}/run`, { method: 'POST' })
    if (!r.ok) {
      const d = await r.json()
      setError(d.error ?? 'Retry failed')
      return
    }

    setSpin(prev => prev ? { ...prev, status: 'generating' } : prev)
    pollRef.current = setInterval(() => pollStatus(spin.id), 5_000)
  }, [spin, pollStatus])

  // Cleanup on unmount
  useEffect(() => () => stopPolling(), [stopPolling])

  const framesDone  = Array.isArray(spin?.image_urls) ? spin.image_urls.filter(Boolean).length : 0
  const progress    = frameCount > 0 ? Math.round((framesDone / frameCount) * 100) : 0

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Generate 360° Spin</h2>
        <p className="text-sm text-zinc-400">
          AI will render <strong className="text-white">{frameCount} frames</strong> of{' '}
          <strong className="text-white">{product.name}</strong> with consistent lighting and camera angle.
        </p>
      </div>

      {!started && !spin && (
        <button
          onClick={handleGenerate}
          className="group w-full flex items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-base font-bold text-white hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] transition-all duration-150 shadow-lg shadow-indigo-900/40"
        >
          <Zap size={18} className="group-hover:scale-110 transition-transform" />
          Generate 360° Spin
        </button>
      )}

      {spin && (
        <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-5 space-y-4">
          {/* Status indicator */}
          <div className="flex items-center gap-2.5">
            {spin.status === 'generating' && (
              <Loader2 size={16} className="text-amber-400 animate-spin shrink-0" />
            )}
            {spin.status === 'ready' && (
              <Check size={16} className="text-emerald-400 shrink-0" />
            )}
            {spin.status === 'failed' && (
              <AlertCircle size={16} className="text-red-400 shrink-0" />
            )}
            <span className={`text-sm font-semibold ${
              spin.status === 'ready'     ? 'text-emerald-400' :
              spin.status === 'failed'    ? 'text-red-400'     :
                                            'text-amber-400'
            }`}>
              {spin.status === 'generating' ? 'Generating frames…' :
               spin.status === 'ready'      ? 'All frames complete!' :
                                              'Generation failed'}
            </span>
          </div>

          {/* Progress bar */}
          {spin.status === 'generating' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Frames generated</span>
                <span className="tabular-nums">{framesDone} / {frameCount}</span>
              </div>
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-700"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-[11px] text-zinc-600">
                This may take several minutes. You can leave this page — progress is saved.
              </p>
            </div>
          )}

          {/* Error + retry */}
          {spin.status === 'failed' && (
            <div className="space-y-3">
              <div className="rounded-xl border border-red-800/50 bg-red-900/20 px-4 py-3 text-xs text-red-400">
                {spin.error_message ?? 'An unknown error occurred during generation.'}
              </div>
              <button
                onClick={handleRetry}
                className="flex items-center gap-2 rounded-xl border border-amber-600 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-600/10 transition-colors"
              >
                <RotateCcw size={14} /> Retry Generation
              </button>
            </div>
          )}

          {/* Frame thumbnails (live) */}
          {framesDone > 0 && (
            <div>
              <p className="text-xs font-medium text-zinc-500 mb-2">Generated so far</p>
              <div
                className="grid gap-1"
                style={{
                  gridTemplateColumns: `repeat(${Math.min(frameCount, 12)}, minmax(0, 1fr))`
                }}
              >
                {Array.from({ length: frameCount }, (_, i) => {
                  const url = spin.image_urls[i]
                  return url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={url}
                      alt={`Frame ${i}`}
                      className="w-full aspect-square rounded object-cover"
                    />
                  ) : (
                    <div key={i} className="w-full aspect-square rounded bg-zinc-800 border border-dashed border-zinc-700" />
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {error && !spin && (
        <div className="rounded-xl border border-red-800/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}
    </div>
  )
}

// ─── Step 5 — Review & Attach ────────────────────────────────────────────────

function Step5Review({
  spin, product, tenantId, onAttached, toast,
}: {
  spin:       Spin360
  product:    Product
  tenantId:   string
  onAttached: () => void
  toast:      (type: 'success' | 'error', msg: string) => void
}) {
  const [attaching, setAttaching] = useState(false)
  const attached = product.spin_360_id === spin.id

  async function handleAttach() {
    setAttaching(true)
    try {
      const r = await fetch(`/api/360-spins/${spin.id}/assign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ product_id: product.id }),
      })
      const d = await r.json()
      if (!r.ok) { toast('error', d.error ?? 'Failed to attach'); return }
      toast('success', `360° spin attached to "${product.name}"`)
      onAttached()
    } finally {
      setAttaching(false)
    }
  }

  async function handleDetach() {
    setAttaching(true)
    try {
      const r = await fetch(`/api/360-spins/${spin.id}/assign`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ product_id: null }),
      })
      if (r.ok) toast('success', 'Spin detached from product')
      else toast('error', 'Failed to detach')
      onAttached()
    } finally {
      setAttaching(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white mb-1">Review & Attach</h2>
        <p className="text-sm text-zinc-400">
          Preview your 360° spin and attach it to{' '}
          <strong className="text-white">{product.name}</strong>.
        </p>
      </div>

      {/* Live viewer */}
      <SpinViewer360Lazy
        urls={spin.image_urls.filter(Boolean)}
        label={spin.name}
        className="max-w-md mx-auto"
      />

      {/* Metadata */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Frames',  value: spin.image_urls.filter(Boolean).length },
          { label: 'Status',  value: 'Ready' },
          { label: 'Product', value: product.name },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-3 text-center">
            <p className="text-lg font-bold text-white truncate">{value}</p>
            <p className="text-[11px] text-zinc-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Action */}
      {attached ? (
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex items-center gap-2 rounded-xl border border-emerald-700/50 bg-emerald-900/20 px-4 py-3 text-sm text-emerald-400">
            <Check size={14} />
            Spin is active on this product
          </div>
          <button
            onClick={handleDetach}
            disabled={attaching}
            className="rounded-xl border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 disabled:opacity-50 transition-colors"
          >
            {attaching ? 'Working…' : 'Detach'}
          </button>
        </div>
      ) : (
        <button
          onClick={handleAttach}
          disabled={attaching}
          className="w-full flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-6 py-4 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50 active:scale-[0.99] transition-all"
        >
          {attaching ? (
            <><Loader2 size={16} className="animate-spin" /> Attaching…</>
          ) : (
            <><Layers size={16} /> Attach to Product</>
          )}
        </button>
      )}
    </div>
  )
}

// ─── Existing Spins sidebar ───────────────────────────────────────────────────

function ExistingSpins({
  tenantId, onPreview,
}: { tenantId: string; onPreview: (spin: Spin360) => void }) {
  const [spins,   setSpins]   = useState<Spin360[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tenantId) return
    setLoading(true)
    fetch(`/api/360-spins?tenant_id=${tenantId}`)
      .then(r => r.json())
      .then(d => setSpins(d.spins ?? []))
      .finally(() => setLoading(false))
  }, [tenantId])

  if (!spins.length && !loading) return null

  const STATUS_COLOR: Record<string, string> = {
    ready:      'text-emerald-400 bg-emerald-400/10',
    generating: 'text-amber-400 bg-amber-400/10',
    failed:     'text-red-400 bg-red-400/10',
  }

  return (
    <div className="mt-8 border-t border-zinc-800 pt-6">
      <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
        Existing Spins for this Business
      </h3>
      {loading ? (
        <div className="flex items-center gap-2 text-zinc-600 text-xs py-2">
          <Loader2 size={12} className="animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-2">
          {spins.map(s => (
            <button
              key={s.id}
              onClick={() => onPreview(s)}
              className="w-full flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left hover:border-zinc-700 transition-colors"
            >
              {/* Thumbnail */}
              {s.image_urls?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image_urls[0]} alt="" className="h-10 w-10 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-zinc-800 shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{s.name}</p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {s.total_frames} frames · {new Date(s.created_at).toLocaleDateString()}
                </p>
              </div>

              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[s.status] ?? ''}`}>
                {s.status}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Root Wizard ─────────────────────────────────────────────────────────────

export default function SpinGeneratorWizard() {
  const [step,       setStep]       = useState(0)
  const [maxStep,    setMaxStep]    = useState(0)
  const [state,      setState]      = useState<WizardState>({
    tenant:      null,
    product:     null,
    spinName:    '',
    description: '',
    frameCount:  24,
  })
  const [completedSpin, setCompletedSpin] = useState<Spin360 | null>(null)
  const { toasts, push: toast }           = useToast()

  function advance(to: number) {
    setStep(to)
    setMaxStep(prev => Math.max(prev, to))
  }

  function updateState<K extends keyof WizardState>(key: K, value: WizardState[K]) {
    setState(prev => ({ ...prev, [key]: value }))
  }

  const canNext = (
    (step === 0 && !!state.tenant)  ||
    (step === 1 && !!state.product) ||
    (step === 2 && !!state.description.trim())
  )

  return (
    <div className="space-y-2">
      <ToastStack toasts={toasts} />

      {/* Step bar */}
      <StepBar current={step} maxReached={maxStep} />

      {/* Step panels */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-900 p-6">
        {step === 0 && (
          <Step1Business
            selected={state.tenant}
            onSelect={t => updateState('tenant', t)}
          />
        )}

        {step === 1 && state.tenant && (
          <Step2Product
            tenantId={state.tenant.id}
            selected={state.product}
            onSelect={p => updateState('product', p)}
          />
        )}

        {step === 2 && state.product && (
          <Step3Configure
            product={state.product}
            state={{ spinName: state.spinName, description: state.description, frameCount: state.frameCount }}
            onChange={(k, v) => {
              if (k === 'frameCount') updateState('frameCount', v as number)
              else if (k === 'spinName') updateState('spinName', v as string)
              else updateState('description', v as string)
            }}
          />
        )}

        {step === 3 && state.product && state.tenant && (
          <Step4Generate
            tenantId={state.tenant.id}
            product={state.product}
            spinName={state.spinName}
            description={state.description}
            frameCount={state.frameCount}
            toast={toast}
            onComplete={spin => {
              setCompletedSpin(spin)
              advance(4)
            }}
          />
        )}

        {step === 4 && completedSpin && state.product && state.tenant && (
          <Step5Review
            spin={completedSpin}
            product={state.product}
            tenantId={state.tenant.id}
            toast={toast}
            onAttached={() => {
              // Refresh product spin_360_id locally
              if (state.product) {
                updateState('product', { ...state.product, spin_360_id: completedSpin.id })
              }
            }}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-1">
        <button
          onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Back
        </button>

        {step < 3 && (
          <button
            onClick={() => advance(step + 1)}
            disabled={!canNext}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Next <ChevronRight size={15} />
          </button>
        )}

        {step === 3 && !completedSpin && (
          <span className="text-xs text-zinc-500">Waiting for generation to complete…</span>
        )}
      </div>

      {/* Existing spins panel (shown when a tenant is selected) */}
      {state.tenant && (
        <ExistingSpins
          tenantId={state.tenant.id}
          onPreview={spin => {
            setCompletedSpin(spin)
            advance(4)
          }}
        />
      )}
    </div>
  )
}
