'use client'
// components/builder/editors/Product360ViewerEditor.tsx
// Sidebar editor for the product_360_viewer section.
// Owner/admin only — never ships editor code to customers.

import { useState, useEffect, useCallback } from 'react'
import { useBuilderStore }                  from '@/lib/builder/store'
import { Toggle, Field }                    from './FormFields'
import type { Product360ViewerContent }     from '@/lib/website/types'

interface Product { id: string; name: string }
interface Package { id: string; name: string; status: string; frames_done: number; target_frame_count: number; is_default: boolean; is_enabled: boolean }

interface Props { sectionId: string }

export function Product360ViewerEditor({ sectionId }: Props) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find(s => s.id === sectionId)
  const content = (section?.content ?? {}) as Partial<Product360ViewerContent>

  const [products,        setProducts]        = useState<Product[]>([])
  const [packages,        setPackages]        = useState<Package[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)

  const tenantId = (section as Record<string, unknown> | undefined)?.tenant_id as string | undefined

  // ── Load products + packages ───────────────────────────────────────────────
  useEffect(() => {
    setLoadingProducts(true)
    const qs = tenantId ? `?tenantId=${tenantId}` : ''
    fetch(`/api/builder/product-360/packages${qs}`)
      .then(r => r.json())
      .then(d => {
        setProducts(d.products ?? [])
        setPackages(d.packages ?? [])
      })
      .catch(() => {})
      .finally(() => setLoadingProducts(false))
  }, [tenantId])

  // Filter packages for selected product
  const productPackages = content.productId
    ? packages.filter(p => (p as unknown as Record<string, unknown>).product_id === content.productId)
    : packages

  const patch = useCallback((key: keyof Product360ViewerContent, value: unknown) => {
    if (!section) return
    updateSectionContent(sectionId, { ...section.content, [key]: value })
  }, [section, sectionId, updateSectionContent])

  if (!section) return null

  const inputStyle = {
    width:        '100%',
    padding:      '0.5rem 0.75rem',
    borderRadius: '0.5rem',
    border:       '1px solid #3f3f46',
    background:   '#18181b',
    color:        '#f4f4f5',
    fontSize:     '0.8125rem',
    outline:      'none',
  } as React.CSSProperties

  const selectStyle = { ...inputStyle }
  const labelStyle  = { display: 'block', fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.375rem' } as React.CSSProperties
  const groupStyle  = { marginBottom: '1rem' } as React.CSSProperties

  return (
    <div>
      {/* Product selector */}
      <div style={groupStyle}>
        <label style={labelStyle}>Product</label>
        {loadingProducts ? (
          <p style={{ fontSize: '0.75rem', color: '#52525b' }}>Loading…</p>
        ) : (
          <select
            value={content.productId ?? ''}
            onChange={e => { patch('productId', e.target.value); patch('packageId', '') }}
            style={selectStyle}
          >
            <option value="">— Select product —</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Package selector */}
      {content.productId && (
        <div style={groupStyle}>
          <label style={labelStyle}>360° Package</label>
          {loadingPackages ? (
            <p style={{ fontSize: '0.75rem', color: '#52525b' }}>Loading packages…</p>
          ) : productPackages.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: '#71717a' }}>
              No 360° packages for this product.{' '}
              <a href="/dashboard/product-360" target="_blank" rel="noreferrer" style={{ color: '#c084fc' }}>
                Create one →
              </a>
            </p>
          ) : (
            <select
              value={content.packageId ?? ''}
              onChange={e => patch('packageId', e.target.value)}
              style={selectStyle}
            >
              <option value="">— Use default enabled package —</option>
              {productPackages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status}{p.is_default ? ' · default' : ''}{p.is_enabled ? '' : ' · disabled'})
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Auto-rotate */}
      <div style={groupStyle}>
        <Toggle
          label="Auto-rotate on load"
          value={content.autoRotate ?? false}
          onChange={v => patch('autoRotate', v)}
        />
      </div>

      {/* Show controls */}
      <div style={groupStyle}>
        <Toggle
          label="Show viewer controls"
          value={content.showControls ?? true}
          onChange={v => patch('showControls', v)}
        />
      </div>

      {/* Show hotspots */}
      <div style={groupStyle}>
        <Toggle
          label="Show hotspots"
          value={content.showHotspots ?? true}
          onChange={v => patch('showHotspots', v)}
        />
      </div>

      {/* Show package label */}
      <div style={groupStyle}>
        <Toggle
          label="Show package name label"
          value={content.showLabel ?? false}
          onChange={v => patch('showLabel', v)}
        />
      </div>

      {/* Speed */}
      {content.autoRotate && (
        <div style={groupStyle}>
          <label style={labelStyle}>Auto-rotate speed (ms/frame)</label>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={content.speed ?? 20}
            onChange={e => patch('speed', Number(e.target.value))}
            style={{ width: '100%', accentColor: '#c084fc' }}
          />
          <p style={{ fontSize: '0.75rem', color: '#52525b', marginTop: '0.25rem' }}>
            {content.speed ?? 20}ms / frame
          </p>
        </div>
      )}

      {/* Info */}
      <div style={{
        padding:      '0.75rem',
        borderRadius: '0.5rem',
        background:   '#1e1b4b44',
        border:       '1px solid #3730a344',
        fontSize:     '0.75rem',
        color:        '#c084fc',
        lineHeight:   1.5,
      }}>
        Customers drag to spin the product 360°. Desktop + mobile. Manage packages in{' '}
        <a href="/dashboard/product-360" target="_blank" rel="noreferrer" style={{ color: '#a78bfa' }}>
          360 Product Studio
        </a>.
      </div>
    </div>
  )
}
