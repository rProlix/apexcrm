'use client'

// components/website/TemplatesClient.tsx
// Premium template gallery for the Website Builder.
// Allows browsing, previewing, and applying templates to the existing website.

import { useState, useEffect } from 'react'
import { WEBSITE_TEMPLATES } from '@/lib/website/templates/templateRegistry'
import type { WebsiteTemplate, TemplateCategory } from '@/lib/website/templates/templateTypes'

// ── Category labels ───────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  all:              'All',
  restaurant:       'Restaurant',
  retail:           'Retail',
  beauty:           'Beauty',
  automotive:       'Automotive',
  law:              'Law',
  medical:          'Medical',
  saas:             'SaaS',
  local_service:    'Local Service',
  promo:            'Promo',
  luxury:           'Luxury',
  one_page:         'One Page',
  product_showcase: 'Product Showcase',
}

const ANIMATION_LABELS: Record<string, string> = {
  none:      'None',
  subtle:    'Subtle',
  balanced:  'Balanced',
  cinematic: 'Cinematic',
}

interface Props {
  tenantId: string
}

interface SlotMapping {
  slot:        string
  sectionType: string
  hasContent:  boolean
  order:       number
}

// ── Main component ─────────────────────────────────────────────────────────

export function TemplatesClient({ tenantId }: Props) {
  const [searchQuery,      setSearchQuery]      = useState('')
  const [activeCategory,   setActiveCategory]   = useState<string>('all')
  const [selectedTemplate, setSelectedTemplate] = useState<WebsiteTemplate | null>(null)
  const [previewMappings,  setPreviewMappings]  = useState<SlotMapping[] | null>(null)
  const [previewing,       setPreviewing]        = useState(false)
  const [applying,         setApplying]          = useState(false)
  const [appliedKey,       setAppliedKey]        = useState<string | null>(null)
  const [error,            setError]             = useState<string | null>(null)
  const [successMsg,       setSuccessMsg]        = useState<string | null>(null)

  // Apply options
  const [preserveBrand,         setPreserveBrand]         = useState(false)
  const [preserveImages,        setPreserveImages]        = useState(true)
  const [generateMissingImages, setGenerateMissingImages] = useState(false)
  const [applyAnimations,       setApplyAnimations]       = useState(true)
  const [createCheckpoint,      setCreateCheckpoint]      = useState(true)

  // Filter templates
  const filtered = WEBSITE_TEMPLATES.filter((t) => {
    const matchCat = activeCategory === 'all' || t.category === activeCategory
    const q = searchQuery.trim().toLowerCase()
    const matchQ = !q
      || t.name.toLowerCase().includes(q)
      || t.description.toLowerCase().includes(q)
      || t.tags.some((tag) => tag.includes(q))
      || t.bestFor.some((b) => b.toLowerCase().includes(q))
    return matchCat && matchQ
  })

  async function handlePreview(template: WebsiteTemplate) {
    setSelectedTemplate(template)
    setPreviewing(true)
    setPreviewMappings(null)
    setError(null)
    try {
      const res = await fetch(`/api/website/templates/${template.key}/preview`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Preview failed')
      setPreviewMappings(json.mappings ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Preview failed')
    } finally {
      setPreviewing(false)
    }
  }

  async function handleApply() {
    if (!selectedTemplate) return
    setApplying(true)
    setError(null)
    setSuccessMsg(null)
    try {
      const res = await fetch(`/api/website/templates/${selectedTemplate.key}/apply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          preserveBrand,
          preserveImages,
          generateMissingImages,
          applyAnimations,
          createCheckpoint,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Apply failed')
      setAppliedKey(selectedTemplate.key)
      setSuccessMsg(json.message ?? `"${selectedTemplate.name}" applied successfully!`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply template')
    } finally {
      setApplying(false)
    }
  }

  const _ = tenantId // suppress unused warning

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f12', color: '#e8e6e0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ padding: '2rem 2rem 0', borderBottom: '1px solid #1e1e26', paddingBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#c9a84c', margin: 0 }}>
              Premium Templates
            </h1>
            <p style={{ margin: '0.25rem 0 0', color: '#7a7570', fontSize: '0.875rem' }}>
              Choose a template to restyle your website. Your existing content is always preserved.
            </p>
          </div>
          <a
            href="/website"
            style={{ color: '#c9a84c', textDecoration: 'none', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            ← Back to Website Builder
          </a>
        </div>

        {/* Search */}
        <div style={{ marginTop: '1.25rem', maxWidth: 440 }}>
          <input
            type="text"
            placeholder="Search templates…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%', padding: '0.625rem 1rem', borderRadius: '0.5rem',
              background: '#1a1a22', border: '1px solid #2a2a36', color: '#e8e6e0',
              fontSize: '0.9375rem', outline: 'none',
            }}
          />
        </div>

        {/* Category chips */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: '1rem' }}>
          {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              style={{
                padding:      '0.3125rem 0.875rem',
                borderRadius: '2rem',
                border:       activeCategory === key ? '1.5px solid #c9a84c' : '1px solid #2a2a36',
                background:   activeCategory === key ? '#c9a84c22' : '#1a1a22',
                color:        activeCategory === key ? '#c9a84c' : '#7a7570',
                fontSize:     '0.8125rem',
                fontWeight:   activeCategory === key ? 600 : 400,
                cursor:       'pointer',
                transition:   'all 0.15s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 200px)' }}>
        {/* Template grid */}
        <div style={{
          flex:    1,
          padding: '1.5rem 2rem',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap:     '1.25rem',
          alignContent: 'start',
        }}>
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '4rem 0', color: '#7a7570' }}>
              No templates found. Try a different search or category.
            </div>
          )}
          {filtered.map((template) => (
            <TemplateCard
              key={template.key}
              template={template}
              isSelected={selectedTemplate?.key === template.key}
              isApplied={appliedKey === template.key}
              onPreview={() => handlePreview(template)}
            />
          ))}
        </div>

        {/* Right panel — preview + apply */}
        {selectedTemplate && (
          <div style={{
            width:       380,
            minWidth:    380,
            borderLeft:  '1px solid #1e1e26',
            padding:     '1.5rem',
            background:  '#0a0a0d',
            overflowY:   'auto',
            maxHeight:   'calc(100vh - 200px)',
            position:    'sticky',
            top:         0,
          }}>
            {/* Template overview */}
            <div style={{
              width:        '100%',
              height:       160,
              borderRadius: '0.75rem',
              background:   selectedTemplate.previewGradient,
              marginBottom: '1.25rem',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              fontSize:     '3rem',
            }}>
              {selectedTemplate.icon}
            </div>

            <h2 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#e8e6e0', margin: '0 0 0.375rem' }}>
              {selectedTemplate.name}
            </h2>
            <p style={{ fontSize: '0.8125rem', color: '#7a7570', margin: '0 0 1rem', lineHeight: 1.55 }}>
              {selectedTemplate.description}
            </p>

            {/* Features */}
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Features</p>
              {selectedTemplate.features.map((f) => (
                <div key={f} style={{ fontSize: '0.8125rem', color: '#a8a4a0', marginBottom: 4, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <span style={{ color: '#c9a84c', marginTop: 2 }}>✓</span> {f}
                </div>
              ))}
            </div>

            {/* Best for */}
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Best for</p>
              <p style={{ fontSize: '0.8125rem', color: '#a8a4a0' }}>{selectedTemplate.bestFor.join(', ')}</p>
            </div>

            {/* Animation level */}
            <div style={{ marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>Animation</p>
              <span style={{
                display: 'inline-block', padding: '0.1875rem 0.625rem', borderRadius: '2rem',
                background: '#1e1e26', border: '1px solid #2a2a36', fontSize: '0.8125rem', color: '#c4bfb0',
              }}>
                {ANIMATION_LABELS[selectedTemplate.animationLevel] ?? selectedTemplate.animationLevel}
              </span>
            </div>

            {/* Content mapping preview */}
            {previewing && (
              <div style={{ padding: '1rem', background: '#1a1a22', borderRadius: '0.5rem', marginBottom: '1rem', textAlign: 'center' }}>
                <p style={{ margin: 0, color: '#7a7570', fontSize: '0.875rem' }}>Loading content preview…</p>
              </div>
            )}
            {previewMappings && !previewing && (
              <div style={{ marginBottom: '1.25rem' }}>
                <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem' }}>
                  Content Mapping ({previewMappings.filter((m) => m.hasContent).length}/{previewMappings.length} sections matched)
                </p>
                {previewMappings.map((m) => (
                  <div key={m.slot} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.375rem 0.625rem', borderRadius: '0.375rem', marginBottom: 4,
                    background: m.hasContent ? '#0d1a0d' : '#1a1a22',
                    border: `1px solid ${m.hasContent ? '#1a3a1a' : '#2a2a36'}`,
                    fontSize: '0.8125rem',
                  }}>
                    <span style={{ color: '#c4bfb0', textTransform: 'capitalize' }}>{m.slot.replace(/_/g, ' ')}</span>
                    <span style={{ color: m.hasContent ? '#4ade80' : '#7a7570' }}>
                      {m.hasContent ? '✓ Your content' : '○ Placeholder'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Apply options */}
            <div style={{ borderTop: '1px solid #1e1e26', paddingTop: '1.25rem', marginBottom: '1.25rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.75rem' }}>Apply Options</p>
              {[
                { label: 'Preserve current brand colors',    value: preserveBrand,         set: setPreserveBrand },
                { label: 'Preserve current images',          value: preserveImages,        set: setPreserveImages },
                { label: 'Generate missing images with AI',  value: generateMissingImages, set: setGenerateMissingImages },
                { label: 'Apply premium animations',         value: applyAnimations,       set: setApplyAnimations },
                { label: 'Create version checkpoint',        value: createCheckpoint,      set: setCreateCheckpoint },
              ].map(({ label, value, set }) => (
                <label key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, cursor: 'pointer' }}>
                  <div
                    onClick={() => set(!value)}
                    style={{
                      width:        40,
                      height:       22,
                      borderRadius: 11,
                      background:   value ? '#c9a84c' : '#2a2a36',
                      position:     'relative',
                      cursor:       'pointer',
                      transition:   'background 0.2s',
                      flexShrink:   0,
                    }}
                  >
                    <div style={{
                      position:   'absolute',
                      top:        3,
                      left:       value ? 20 : 3,
                      width:      16,
                      height:     16,
                      borderRadius: 8,
                      background: '#ffffff',
                      transition: 'left 0.2s',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.8125rem', color: '#a8a4a0' }}>{label}</span>
                </label>
              ))}
            </div>

            {/* Error / success */}
            {error && (
              <div style={{ padding: '0.75rem', background: '#1a0505', border: '1px solid #4a1010', borderRadius: '0.5rem', marginBottom: '0.875rem' }}>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#ef4444' }}>{error}</p>
              </div>
            )}
            {successMsg && (
              <div style={{ padding: '0.75rem', background: '#0a1a0d', border: '1px solid #1a4a20', borderRadius: '0.5rem', marginBottom: '0.875rem' }}>
                <p style={{ margin: 0, fontSize: '0.8125rem', color: '#4ade80' }}>{successMsg}</p>
                <a href="/website" style={{ display: 'inline-block', marginTop: '0.5rem', color: '#c9a84c', fontSize: '0.8125rem', textDecoration: 'none', fontWeight: 600 }}>
                  ← Back to builder →
                </a>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
              {!previewMappings && !previewing && !successMsg && (
                <button
                  onClick={() => handlePreview(selectedTemplate)}
                  disabled={previewing}
                  style={{
                    padding:      '0.75rem 1rem',
                    borderRadius: '0.5rem',
                    border:       '1px solid #c9a84c',
                    background:   '#c9a84c18',
                    color:        '#c9a84c',
                    fontWeight:   600,
                    fontSize:     '0.9375rem',
                    cursor:       'pointer',
                    width:        '100%',
                  }}
                >
                  Preview with My Content
                </button>
              )}
              {(previewMappings || successMsg) && (
                <button
                  onClick={handleApply}
                  disabled={applying || !!successMsg}
                  style={{
                    padding:      '0.875rem 1rem',
                    borderRadius: '0.5rem',
                    border:       'none',
                    background:   applying || successMsg ? '#3a3a36' : 'linear-gradient(135deg, #c9a84c, #e8c96b)',
                    color:        applying || successMsg ? '#7a7570' : '#1a1200',
                    fontWeight:   700,
                    fontSize:     '0.9375rem',
                    cursor:       applying || successMsg ? 'not-allowed' : 'pointer',
                    width:        '100%',
                  }}
                >
                  {applying ? 'Applying Template…' : successMsg ? '✓ Applied' : `Apply "${selectedTemplate.name}"`}
                </button>
              )}
              <button
                onClick={() => { setSelectedTemplate(null); setPreviewMappings(null); setError(null); setSuccessMsg(null) }}
                style={{
                  padding:      '0.625rem 1rem',
                  borderRadius: '0.5rem',
                  border:       '1px solid #2a2a36',
                  background:   '#1a1a22',
                  color:        '#7a7570',
                  fontSize:     '0.875rem',
                  cursor:       'pointer',
                  width:        '100%',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  isSelected,
  isApplied,
  onPreview,
}: {
  template:   WebsiteTemplate
  isSelected: boolean
  isApplied:  boolean
  onPreview:  () => void
}) {
  const [hovered, setHovered] = useState(false)

  return (
    <div
      onClick={onPreview}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderRadius: '0.875rem',
        border:       isSelected
          ? '2px solid #c9a84c'
          : hovered
          ? '1.5px solid #3a3a46'
          : '1.5px solid #1e1e26',
        background:   isSelected ? '#1a1610' : '#14141a',
        cursor:       'pointer',
        overflow:     'hidden',
        transition:   'all 0.2s',
        boxShadow:    hovered ? '0 4px 24px rgba(0,0,0,0.4)' : undefined,
      }}
    >
      {/* Preview gradient */}
      <div style={{
        height:         150,
        background:     template.previewGradient,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:       '2.5rem',
        position:       'relative',
      }}>
        {template.icon}
        {isApplied && (
          <div style={{
            position:     'absolute',
            top:          8,
            right:        8,
            background:   '#4ade80',
            color:        '#000',
            fontSize:     '0.6875rem',
            fontWeight:   700,
            padding:      '0.1875rem 0.5rem',
            borderRadius: '2rem',
          }}>
            ACTIVE
          </div>
        )}
        <div style={{
          position:   'absolute',
          bottom:     8,
          left:       8,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          padding:    '0.1875rem 0.5rem',
          borderRadius: '0.375rem',
          fontSize:   '0.6875rem',
          color:      '#fff',
          fontWeight: 600,
        }}>
          {ANIMATION_LABELS[template.animationLevel] ?? template.animationLevel} animations
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '0.875rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: isSelected ? '#c9a84c' : '#e8e6e0', margin: 0 }}>
            {template.name}
          </h3>
          <span style={{
            fontSize:     '0.6875rem',
            color:        '#7a7570',
            background:   '#1a1a22',
            border:       '1px solid #2a2a36',
            padding:      '0.1875rem 0.5rem',
            borderRadius: '2rem',
            whiteSpace:   'nowrap',
            flexShrink:   0,
          }}>
            {CATEGORY_LABELS[template.category] ?? template.category}
          </span>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#7a7570', margin: '0.375rem 0 0.625rem', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {template.description}
        </p>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} style={{
              fontSize:     '0.6875rem',
              color:        '#c4bfb0',
              background:   '#1a1a22',
              padding:      '0.125rem 0.4375rem',
              borderRadius: '2rem',
            }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
