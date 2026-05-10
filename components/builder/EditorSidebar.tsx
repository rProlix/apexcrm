'use client'

// components/builder/EditorSidebar.tsx
// Right-side panel that opens when a section is selected in edit mode.
// Renders the appropriate section-specific editor form and AI image controls.

import { useState, useCallback } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { SECTION_TYPE_MAP } from '@/lib/builder/defaults'
import { generateSectionAiImage } from '@/lib/builder/api'
import { HeroEditor }              from './editors/HeroEditor'
import { FeatureGridEditor }       from './editors/FeatureGridEditor'
import { CtaEditor }              from './editors/CtaEditor'
import { RichTextEditor }         from './editors/RichTextEditor'
import { BannerEditor }           from './editors/BannerEditor'
import { TestimonialsEditor }     from './editors/TestimonialsEditor'
import { FaqEditor }              from './editors/FaqEditor'
import { AboutEditor }            from './editors/AboutEditor'
import { Product360ViewerEditor } from './editors/Product360ViewerEditor'
import { GenericEditor }          from './editors/GenericEditor'
import { Toggle }                 from './editors/FormFields'

const SIDEBAR_WIDTH = 360

// Section types that support AI image generation
const IMAGE_CAPABLE_SECTIONS = new Set([
  'hero', 'about', 'feature_grid', 'testimonials', 'faq',
  'contact', 'product_grid', 'image_gallery', 'cta',
])

interface AiImageState {
  loading:   boolean
  publicUrl: string | null
  error:     string | null
  applied:   boolean
}

export function EditorSidebar() {
  const {
    selectedSectionId, selectSection,
    sections, toggleSectionVisibility,
    updateSectionContent,
    saveStatus,
    tenantId,
  } = useBuilderStore()

  const [aiImage, setAiImage] = useState<AiImageState>({
    loading: false, publicUrl: null, error: null, applied: false,
  })
  const [showDebug, setShowDebug] = useState(false)
  const [debugInfo, setDebugInfo] = useState<Record<string, unknown> | null>(null)

  if (!selectedSectionId) return null

  const section = sections.find((s) => s.id === selectedSectionId)
  if (!section) return null

  const meta = SECTION_TYPE_MAP.get(section.section_type)
  const canGenerateImage = IMAGE_CAPABLE_SECTIONS.has(section.section_type)

  const handleGenerateAiImage = useCallback(async () => {
    if (!tenantId) return
    setAiImage({ loading: true, publicUrl: null, error: null, applied: false })
    setDebugInfo(null)

    try {
      const result = await generateSectionAiImage(section.id, tenantId)

      if (result.error) {
        setAiImage({ loading: false, publicUrl: null, error: result.error, applied: false })
        return
      }

      setAiImage({
        loading:  false,
        publicUrl: result.publicUrl,
        error:    null,
        applied:  result.applied,
      })

      // If the section was updated server-side, refresh it in the store
      if (result.updatedSection && result.applied) {
        updateSectionContent(result.updatedSection.id, result.updatedSection.content as Record<string, unknown>)
      }

      // Store debug info
      const resultAny = result as unknown as Record<string, unknown>
      if (resultAny._debug) {
        setDebugInfo(resultAny._debug as Record<string, unknown>)
      }
    } catch (err) {
      setAiImage({
        loading:  false,
        publicUrl: null,
        error:    err instanceof Error ? err.message : 'Image generation failed',
        applied:  false,
      })
    }
  }, [section.id, tenantId, updateSectionContent])

  const handleRegenerateAiImage = useCallback(() => {
    setAiImage({ loading: false, publicUrl: null, error: null, applied: false })
    handleGenerateAiImage()
  }, [handleGenerateAiImage])

  return (
    <div style={{
      position:      'fixed',
      top:           48,
      right:         0,
      bottom:        0,
      width:         SIDEBAR_WIDTH,
      background:    '#111113',
      borderLeft:    '1px solid #27272a',
      display:       'flex',
      flexDirection: 'column',
      zIndex:        9998,
      fontFamily:    'Inter, system-ui, sans-serif',
      overflowY:     'auto',
    }}>
      {/* Header */}
      <div style={{
        padding:      '1rem 1.25rem',
        borderBottom: '1px solid #27272a',
        display:      'flex',
        alignItems:   'center',
        gap:          '0.75rem',
        position:     'sticky',
        top:          0,
        background:   '#111113',
        zIndex:       1,
      }}>
        <span style={{ fontSize: '1.25rem' }}>{meta?.icon ?? '📄'}</span>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 700, color: '#f4f4f5', fontSize: '0.9375rem' }}>
            {meta?.label ?? section.section_type}
          </p>
          <p style={{ margin: 0, fontSize: '0.75rem', color: '#52525b' }}>
            {meta?.description ?? 'Section editor'}
          </p>
        </div>
        <button
          onClick={() => selectSection(null)}
          style={{
            width:          28,
            height:         28,
            borderRadius:   '0.375rem',
            border:         '1px solid #3f3f46',
            background:     'transparent',
            color:          '#71717a',
            cursor:         'pointer',
            fontSize:       '1rem',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>
      </div>

      {/* Visibility toggle */}
      <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #27272a' }}>
        <Toggle
          label="Section Visible"
          value={section.is_visible}
          onChange={() => toggleSectionVisibility(section.id)}
        />
      </div>

      {/* AI Image Generation (for image-capable sections) */}
      {canGenerateImage && (
        <div style={{
          padding:      '0.875rem 1.25rem',
          borderBottom: '1px solid #27272a',
          background:   '#0d0d0f',
        }}>
          <p style={{ margin: '0 0 0.625rem', fontSize: '0.75rem', fontWeight: 600, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AI Image
          </p>

          {/* Current generated image preview */}
          {aiImage.publicUrl && (
            <div style={{ marginBottom: '0.625rem', borderRadius: '0.375rem', overflow: 'hidden', border: '1px solid #27272a' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={aiImage.publicUrl}
                alt="AI generated image"
                style={{ width: '100%', display: 'block', maxHeight: 140, objectFit: 'cover' }}
              />
              <div style={{ padding: '0.375rem 0.625rem', background: '#18181b', fontSize: '0.6875rem', color: '#52525b' }}>
                {aiImage.applied ? '✓ Applied to section' : '⏳ Preview only'}
              </div>
            </div>
          )}

          {/* Error */}
          {aiImage.error && (
            <div style={{
              marginBottom: '0.625rem',
              padding:      '0.5rem 0.625rem',
              borderRadius: '0.375rem',
              background:   'rgba(239,68,68,0.08)',
              border:       '1px solid rgba(239,68,68,0.2)',
              fontSize:     '0.75rem',
              color:        '#f87171',
            }}>
              {aiImage.error.length > 120 ? aiImage.error.slice(0, 120) + '…' : aiImage.error}
            </div>
          )}

          {/* Generate / Regenerate button */}
          {!aiImage.loading && !aiImage.publicUrl && (
            <button
              onClick={handleGenerateAiImage}
              style={aiButtonStyle('#7c3aed', '#6d28d9')}
            >
              ✨ Generate AI Image
            </button>
          )}

          {aiImage.loading && (
            <div style={{
              display:        'flex',
              alignItems:     'center',
              gap:            '0.5rem',
              padding:        '0.625rem 0.875rem',
              borderRadius:   '0.375rem',
              background:     'rgba(124,58,237,0.1)',
              border:         '1px solid rgba(124,58,237,0.2)',
              fontSize:       '0.8125rem',
              color:          '#a78bfa',
            }}>
              <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
              Generating with Imagen 4…
            </div>
          )}

          {!aiImage.loading && aiImage.publicUrl && (
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={handleRegenerateAiImage}
                style={{ ...aiButtonStyle('#3f3f46', '#52525b'), flex: 1, fontSize: '0.75rem' }}
              >
                🔄 Regenerate
              </button>
              <button
                onClick={() => setShowDebug(!showDebug)}
                style={{ ...aiButtonStyle('#1c1c1e', '#27272a'), padding: '0.5rem 0.625rem', fontSize: '0.75rem' }}
                title="View image context"
              >
                🔍
              </button>
            </div>
          )}

          {/* Debug panel (owner/admin only) */}
          {showDebug && debugInfo && (
            <div style={{
              marginTop:    '0.625rem',
              padding:      '0.625rem',
              borderRadius: '0.375rem',
              background:   '#0a0a0b',
              border:       '1px solid #27272a',
              fontSize:     '0.6875rem',
              color:        '#71717a',
              fontFamily:   'monospace',
            }}>
              <p style={{ margin: '0 0 0.25rem', color: '#a1a1aa', fontWeight: 600 }}>Image Context</p>
              {Object.entries(debugInfo).map(([k, v]) => (
                <div key={k} style={{ marginBottom: '0.125rem' }}>
                  <span style={{ color: '#52525b' }}>{k}:</span>{' '}
                  <span style={{ color: '#a1a1aa' }}>
                    {Array.isArray(v) ? v.join(', ') : String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section-specific editor */}
      <div style={{ padding: '1.25rem', flex: 1 }}>
        {renderEditor(section.section_type, section.id)}
      </div>

      {/* Footer */}
      <div style={{
        padding:   '0.75rem 1.25rem',
        borderTop: '1px solid #27272a',
        position:  'sticky',
        bottom:    0,
        background: '#111113',
      }}>
        <p style={{
          margin:    0,
          fontSize:  '0.75rem',
          color:     saveStatus === 'saving' ? '#f59e0b'
                    : saveStatus === 'saved'  ? '#22c55e'
                    : saveStatus === 'error'  ? '#ef4444'
                    : '#3f3f46',
          textAlign: 'center',
        }}>
          {saveStatus === 'saving' ? '⏳ Saving changes…'
          : saveStatus === 'saved'  ? '✓ All changes saved'
          : saveStatus === 'error'  ? '✗ Save failed — check connection'
          : ''}
        </p>
      </div>
    </div>
  )
}

function aiButtonStyle(bg: string, hover: string): React.CSSProperties {
  return {
    width:          '100%',
    padding:        '0.5625rem 0.875rem',
    borderRadius:   '0.375rem',
    border:         'none',
    background:     bg,
    color:          '#f4f4f5',
    fontSize:       '0.8125rem',
    fontWeight:     600,
    cursor:         'pointer',
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '0.375rem',
    transition:     'background 0.15s',
  }
}

function renderEditor(sectionType: string, sectionId: string) {
  switch (sectionType) {
    case 'hero':                return <HeroEditor sectionId={sectionId} />
    case 'feature_grid':        return <FeatureGridEditor sectionId={sectionId} />
    case 'cta':                 return <CtaEditor sectionId={sectionId} />
    case 'rich_text':           return <RichTextEditor sectionId={sectionId} />
    case 'banner':              return <BannerEditor sectionId={sectionId} />
    case 'testimonials':        return <TestimonialsEditor sectionId={sectionId} />
    case 'faq':                 return <FaqEditor sectionId={sectionId} />
    case 'about':               return <AboutEditor sectionId={sectionId} />
    case 'product_360_viewer':  return <Product360ViewerEditor sectionId={sectionId} />
    default:                    return <GenericEditor sectionId={sectionId} />
  }
}
