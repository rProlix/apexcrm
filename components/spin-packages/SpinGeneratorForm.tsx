'use client'
// components/spin-packages/SpinGeneratorForm.tsx
// The main owner-facing form to create and trigger a spin package.

import { useState, useEffect } from 'react'
import type { SpinPackageWithImages } from '@/types/spin-packages'
import SpinStatusBadge from './SpinStatusBadge'
import SpinImageGrid   from './SpinImageGrid'
import SpinViewerLazy  from '@/components/spin-viewer/SpinViewerLazy'

interface Tenant {
  id:   string
  name: string
}

interface Product {
  id:              string
  name:            string
  spin_package_id: string | null
}

export default function SpinGeneratorForm() {
  const [tenants,         setTenants]         = useState<Tenant[]>([])
  const [products,        setProducts]        = useState<Product[]>([])
  const [selectedTenant,  setSelectedTenant]  = useState('')
  const [selectedProduct, setSelectedProduct] = useState('')
  const [promptText,      setPromptText]      = useState('')
  const [imageCount,      setImageCount]      = useState(24)
  const [packages,        setPackages]        = useState<SpinPackageWithImages[]>([])
  const [activePackage,   setActivePackage]   = useState<SpinPackageWithImages | null>(null)
  const [creating,        setCreating]        = useState(false)
  const [generating,      setGenerating]      = useState(false)
  const [pollingId,       setPollingId]       = useState<string | null>(null)
  const [error,           setError]           = useState<string | null>(null)

  // ── Load tenants (owner sees all) ─────────────────────────────────────────
  useEffect(() => {
    fetch('/api/owner/tenants')
      .then(r => r.json())
      .then(d => {
        const list: Tenant[] = d.tenants ?? []
        setTenants(list)
        if (list.length === 1) setSelectedTenant(list[0].id)
      })
      .catch(() => {})
  }, [])

  // ── Load products when tenant changes ─────────────────────────────────────
  useEffect(() => {
    if (!selectedTenant) { setProducts([]); return }
    fetch(`/api/store/products?tenant_id=${selectedTenant}`)
      .then(r => r.json())
      .then(d => {
        setProducts(d.products ?? [])
        setSelectedProduct('')
      })
      .catch(() => {})
  }, [selectedTenant])

  // ── Load existing packages when product changes ───────────────────────────
  useEffect(() => {
    if (!selectedProduct) { setPackages([]); setActivePackage(null); return }
    fetch(`/api/spin-packages?tenant_id=${selectedTenant}&product_id=${selectedProduct}`)
      .then(r => r.json())
      .then(d => {
        const pkgs: SpinPackageWithImages[] = d.packages ?? []
        setPackages(pkgs)
        setActivePackage(pkgs[0] ?? null)
      })
      .catch(() => {})
  }, [selectedProduct, selectedTenant])

  // ── Poll status while a package is generating ─────────────────────────────
  useEffect(() => {
    if (!pollingId) return
    const interval = setInterval(async () => {
      try {
        const r    = await fetch(`/api/spin-packages/${pollingId}?tenant_id=${selectedTenant}`)
        const data = await r.json()
        const pkg: SpinPackageWithImages = data.package
        setActivePackage(pkg)
        setPackages(prev => prev.map(p => p.id === pkg.id ? pkg : p))
        if (pkg.status !== 'generating') {
          setPollingId(null)
          setGenerating(false)
        }
      } catch { /* ignore */ }
    }, 5_000)
    return () => clearInterval(interval)
  }, [pollingId, selectedTenant])

  // ── Create spin package ────────────────────────────────────────────────────
  async function handleCreate() {
    if (!selectedProduct || !promptText.trim()) return
    setError(null)
    setCreating(true)
    try {
      const r = await fetch('/api/spin-packages', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenant_id:   selectedTenant,
          product_id:  selectedProduct,
          prompt_text: promptText.trim(),
          image_count: imageCount,
        }),
      })
      const data = await r.json()
      if (!r.ok) { setError(data.error ?? 'Failed to create package'); return }

      const newPkg: SpinPackageWithImages = { ...data.package, images: [] }
      setPackages(prev => [newPkg, ...prev])
      setActivePackage(newPkg)
    } finally {
      setCreating(false)
    }
  }

  // ── Trigger generation ────────────────────────────────────────────────────
  async function handleGenerate(packageId: string, repair = false) {
    setError(null)
    setGenerating(true)
    setPollingId(packageId)

    // Fire-and-forget the generation endpoint; poll status separately
    fetch(`/api/spin-packages/${packageId}/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ repair }),
    }).catch(err => {
      setError(String(err))
      setGenerating(false)
      setPollingId(null)
    })
  }

  // ── Assign to product ─────────────────────────────────────────────────────
  async function handleAssign(packageId: string) {
    const r = await fetch(`/api/spin-packages/${packageId}/assign`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ product_id: selectedProduct }),
    })
    const data = await r.json()
    if (!r.ok) { setError(data.error ?? 'Failed to assign'); return }

    // Refresh product list so spin_package_id updates
    setProducts(prev => prev.map(p =>
      p.id === selectedProduct ? { ...p, spin_package_id: packageId } : p
    ))
  }

  // ── Delete package ────────────────────────────────────────────────────────
  async function handleDelete(packageId: string) {
    if (!confirm('Delete this spin package and all its images?')) return
    await fetch(`/api/spin-packages/${packageId}`, { method: 'DELETE' })
    setPackages(prev => prev.filter(p => p.id !== packageId))
    if (activePackage?.id === packageId) setActivePackage(null)
  }

  const currentProduct = products.find(p => p.id === selectedProduct)

  return (
    <div className="space-y-8">
      {/* ── Selector row ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Business</label>
          <select
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
            value={selectedTenant}
            onChange={e => setSelectedTenant(e.target.value)}
          >
            <option value="">— Select business —</option>
            {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Product</label>
          <select
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none disabled:opacity-50"
            value={selectedProduct}
            onChange={e => setSelectedProduct(e.target.value)}
            disabled={!selectedTenant}
          >
            <option value="">— Select product —</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.spin_package_id ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Create new package form ───────────────────────────────────────── */}
      {selectedProduct && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/50 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Create New Spin Package</h3>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">
              Product Description (used as prompt)
            </label>
            <textarea
              rows={3}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
              placeholder="e.g. Sup Chay tofu broccoli noodles vegan broth, traditional Vietnamese packaging…"
              value={promptText}
              onChange={e => setPromptText(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-6">
            <div>
              <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                Frame Count
              </label>
              <select
                className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white focus:border-indigo-500 focus:outline-none"
                value={imageCount}
                onChange={e => setImageCount(Number(e.target.value))}
              >
                {[12, 24, 36].map(n => (
                  <option key={n} value={n}>{n} frames ({Math.round(360 / n)}° each)</option>
                ))}
              </select>
            </div>

            <button
              onClick={handleCreate}
              disabled={creating || !promptText.trim()}
              className="mt-5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? 'Creating…' : 'Create Package'}
            </button>
          </div>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="rounded-lg border border-red-700/50 bg-red-900/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* ── Existing packages list ────────────────────────────────────────── */}
      {packages.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white">Spin Packages</h3>
          <div className="divide-y divide-zinc-800 rounded-xl border border-zinc-700 overflow-hidden">
            {packages.map(pkg => (
              <button
                key={pkg.id}
                onClick={() => setActivePackage(pkg)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-zinc-800 transition-colors ${
                  activePackage?.id === pkg.id ? 'bg-zinc-800' : 'bg-zinc-900'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{pkg.prompt_text}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {pkg.image_count} frames · {new Date(pkg.created_at).toLocaleDateString()}
                  </p>
                </div>
                <SpinStatusBadge status={pkg.status} />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Active package detail ─────────────────────────────────────────── */}
      {activePackage && (
        <div className="rounded-xl border border-zinc-700 bg-zinc-800/40 p-5 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SpinStatusBadge status={activePackage.status} />
                {currentProduct?.spin_package_id === activePackage.id && (
                  <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                    Assigned to product
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-xs text-zinc-400 leading-relaxed">{activePackage.prompt_text}</p>
              {activePackage.error_message && (
                <p className="mt-1 text-xs text-red-400">{activePackage.error_message}</p>
              )}
            </div>

            <button
              onClick={() => handleDelete(activePackage.id)}
              className="shrink-0 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-red-600 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {(activePackage.status === 'draft' || activePackage.status === 'failed') && (
              <button
                onClick={() => handleGenerate(activePackage.id)}
                disabled={generating}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
              >
                {generating ? 'Generating…' : 'Generate 360 Spin'}
              </button>
            )}

            {activePackage.status === 'failed' && (activePackage.images?.length ?? 0) > 0 && (
              <button
                onClick={() => handleGenerate(activePackage.id, true)}
                disabled={generating}
                className="rounded-lg border border-amber-600 px-4 py-2 text-sm font-medium text-amber-400 hover:bg-amber-600/10 disabled:opacity-50 transition-colors"
              >
                Repair Missing Frames
              </button>
            )}

            {activePackage.status === 'ready' && currentProduct?.spin_package_id !== activePackage.id && (
              <button
                onClick={() => handleAssign(activePackage.id)}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 transition-colors"
              >
                Assign to Product
              </button>
            )}

            {activePackage.status === 'ready' && currentProduct?.spin_package_id === activePackage.id && (
              <button
                onClick={async () => {
                  await fetch(`/api/spin-packages/${activePackage.id}/assign`, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ product_id: null }),
                  })
                  setProducts(prev => prev.map(p =>
                    p.id === selectedProduct ? { ...p, spin_package_id: null } : p
                  ))
                }}
                className="rounded-lg border border-zinc-600 px-4 py-2 text-sm font-medium text-zinc-300 hover:border-zinc-500 transition-colors"
              >
                Unassign
              </button>
            )}
          </div>

          {/* Progress bar while generating */}
          {activePackage.status === 'generating' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>Generating frames…</span>
                <span>{activePackage.images?.length ?? 0} / {activePackage.image_count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-zinc-700 overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.round(((activePackage.images?.length ?? 0) / activePackage.image_count) * 100)}%`
                  }}
                />
              </div>
            </div>
          )}

          {/* Frame grid preview */}
          {(activePackage.images?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">
                Frame Preview ({activePackage.images?.length} / {activePackage.image_count})
              </p>
              <SpinImageGrid
                images={activePackage.images ?? []}
                imageCount={activePackage.image_count}
              />
            </div>
          )}

          {/* Live 360 viewer preview */}
          {activePackage.status === 'ready' && (activePackage.images?.length ?? 0) > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-zinc-400">360° Viewer Preview</p>
              <div className="max-w-sm">
                <SpinViewerLazy
                  images={(activePackage.images ?? []).map(img => ({
                    frame_index: img.frame_index,
                    url:         img.image_url,
                  }))}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
