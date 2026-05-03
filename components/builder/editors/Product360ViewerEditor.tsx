'use client'

// components/builder/editors/Product360ViewerEditor.tsx
// Sidebar editor for the product_360_viewer section.
// Owner/admin only — never ships editor code to customers.

import { useState, useEffect, useCallback } from 'react'
import { useBuilderStore }                  from '@/lib/builder/store'
import { Toggle, Field }                    from './FormFields'
import type { Product360ViewerContent }     from '@/lib/website/types'

interface Product { id: string; name: string; spin_package_id: string | null }
interface Package { id: string; name: string | null; status: string; frames_done: number; frame_count: number }

interface Props { sectionId: string }

export function Product360ViewerEditor({ sectionId }: Props) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find(s => s.id === sectionId)
  const content = (section?.content ?? {}) as Partial<Product360ViewerContent>

  const [products, setProducts] = useState<Product[]>([])
  const [packages, setPackages] = useState<Package[]>([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [loadingPackages, setLoadingPackages] = useState(false)

  // tenant_id is a first-class field on BuilderSection — no cast needed
  const tenantId = section?.tenant_id

  // ── Load products ─────────────────────────────────────────────────────────
  useEffect(() => {
    setLoadingProducts(true)
    const qs = tenantId ? `?tenant_id=${tenantId}` : ''
    fetch(`/api/360/products${qs}`)
      .then(r => r.json())
      .then(d => setProducts(d.products ?? []))
      .catch(() => {})
      .finally(() => setLoadingProducts(false))
  }, [tenantId])

  // ── Load packages when product changes ────────────────────────────────────
  useEffect(() => {
    if (!content.productId) { setPackages([]); return }
    setLoadingPackages(true)
    const qs = tenantId ? `?tenant_id=${tenantId}` : ''
    fetch(`/api/360/packages${qs}`)
      .then(r => r.json())
      .then(d => {
        const all: Package[] = d.packages ?? []
        setPackages(all.filter(p => p.status === 'ready'))
      })
      .catch(() => {})
      .finally(() => setLoadingPackages(false))
  }, [content.productId, tenantId])

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
          <p style={{ fontSize: '0.75rem', color: '#52525b' }}>Loading products…</p>
        ) : (
          <select
            value={content.productId ?? ''}
            onChange={e => {
              patch('productId', e.target.value)
              patch('packageId', '')
            }}
            style={selectStyle}
          >
            <option value="">— Select product —</option>
            {products.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.spin_package_id ? ' ✓ 360°' : ''}
              </option>
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
          ) : packages.length === 0 ? (
            <p style={{ fontSize: '0.75rem', color: '#71717a' }}>
              No ready 360° packages for this product.{' '}
              <a href="/dashboard/360" target="_blank" rel="noreferrer" style={{ color: '#c084fc' }}>
                Create one →
              </a>
            </p>
          ) : (
            <select
              value={content.packageId ?? ''}
              onChange={e => patch('packageId', e.target.value)}
              style={selectStyle}
            >
              <option value="">— Use product&apos;s default —</option>
              {packages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name ?? p.id} ({p.frames_done}/{p.frame_count} frames)
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Label */}
      <div style={groupStyle}>
        <Field label="Overlay Label (optional)">
          <input
            type="text"
            value={content.label ?? ''}
            onChange={e => patch('label', e.target.value)}
            placeholder="e.g. Premium Sneaker"
            style={inputStyle}
          />
        </Field>
      </div>

      {/* Auto-rotate */}
      <div style={groupStyle}>
        <Toggle
          label="Auto-rotate on load"
          value={content.autoRotate ?? false}
          onChange={v => patch('autoRotate', v)}
        />
      </div>

      {/* Speed */}
      {content.autoRotate && (
        <div style={groupStyle}>
          <label style={labelStyle}>Autoplay speed (fps)</label>
          <input
            type="range"
            min={4}
            max={36}
            step={1}
            value={content.speed ?? 18}
            onChange={e => patch('speed', Number(e.target.value))}
            style={{ width: '100%', accentColor: '#c084fc' }}
          />
          <p style={{ fontSize: '0.75rem', color: '#52525b', marginTop: '0.25rem' }}>
            {content.speed ?? 18} fps
          </p>
        </div>
      )}

      {/* Info callout */}
      <div style={{
        padding:      '0.75rem',
        borderRadius: '0.5rem',
        background:   '#1e1b4b44',
        border:       '1px solid #3730a344',
        fontSize:     '0.75rem',
        color:        '#c084fc',
        lineHeight:   1.5,
      }}>
        Customers drag left/right to spin the product 360°. Works on desktop and mobile.
        Frames are preloaded for instant interaction.
      </div>
    </div>
  )
}
