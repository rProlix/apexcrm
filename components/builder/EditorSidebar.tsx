'use client'

// components/builder/EditorSidebar.tsx
// Right-side panel that opens when a section is selected in edit mode.
// Renders section-specific editor forms + premium AI image gallery picker.

import { useState, useCallback, useEffect } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { SECTION_TYPE_MAP } from '@/lib/builder/defaults'
import {
  generateSectionAiImage,
  getSectionImages,
  activateSectionImage,
  archiveSectionImage,
  restoreSectionImage,
  type WebsiteGeneratedImage,
} from '@/lib/builder/api'
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
import { AiPremiumDesignPanel }  from '@/components/website/builder/AiPremiumDesignPanel'

const SIDEBAR_WIDTH = 380

// Section types that support AI image generation
const IMAGE_CAPABLE_SECTIONS = new Set([
  'hero', 'about', 'feature_grid', 'testimonials', 'faq',
  'contact', 'product_grid', 'image_gallery', 'cta', 'visit_showroom', 'showroom',
])

// ── Types ──────────────────────────────────────────────────────────────────────

interface AiImageState {
  loading:   boolean
  publicUrl: string | null
  error:     string | null
  applied:   boolean
  imageCount?: number
}

// ── Helper styles ──────────────────────────────────────────────────────────────

function btn(
  bg: string,
  hover: string,
  extra?: React.CSSProperties,
): React.CSSProperties {
  return {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            '0.375rem',
    width:          '100%',
    padding:        '0.5rem 0.75rem',
    borderRadius:   '0.375rem',
    border:         'none',
    background:     bg,
    color:          '#f4f4f5',
    fontSize:       '0.8125rem',
    fontWeight:     600,
    cursor:         'pointer',
    transition:     'background 0.15s',
    ...extra,
  }
}

function row(extra?: React.CSSProperties): React.CSSProperties {
  return { display: 'flex', gap: '0.5rem', ...extra }
}

// ── Section editor switch ──────────────────────────────────────────────────────

function renderEditor(sectionType: string, sectionId: string) {
  const t = sectionType
  if (t === 'hero')         return <HeroEditor sectionId={sectionId} />
  if (t === 'feature_grid') return <FeatureGridEditor sectionId={sectionId} />
  if (t === 'cta')          return <CtaEditor sectionId={sectionId} />
  if (t === 'rich_text')    return <RichTextEditor sectionId={sectionId} />
  if (t === 'banner')       return <BannerEditor sectionId={sectionId} />
  if (t === 'testimonials') return <TestimonialsEditor sectionId={sectionId} />
  if (t === 'faq')          return <FaqEditor sectionId={sectionId} />
  if (t === 'about')        return <AboutEditor sectionId={sectionId} />
  if (t === 'product_360')  return <Product360ViewerEditor sectionId={sectionId} />
  return <GenericEditor sectionId={sectionId} />
}

// ── Sub-component: Image thumbnail card ───────────────────────────────────────

function ImageCard({
  img,
  onActivate,
  onArchive,
  onRestore,
  loading,
}: {
  img:        WebsiteGeneratedImage
  onActivate: (id: string) => void
  onArchive:  (id: string) => void
  onRestore:  (id: string) => void
  loading:    string | null
}) {
  const isLoading = loading === img.id
  const date      = new Date(img.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  return (
    <div style={{
      borderRadius: '0.5rem',
      border:       img.is_active && !img.is_archived
        ? '2px solid #7c3aed'
        : '1px solid #27272a',
      overflow:     'hidden',
      background:   '#0d0d0f',
      opacity:      img.is_archived ? 0.55 : 1,
    }}>
      {/* Thumbnail */}
      <div style={{ position: 'relative', aspectRatio: '16/9', background: '#18181b', overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={img.image_url || img.public_url || ''}
          alt={img.alt_text ?? 'AI generated image'}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          loading="lazy"
        />
        {img.is_active && !img.is_archived && (
          <div style={{
            position:   'absolute',
            top:        '0.375rem',
            left:       '0.375rem',
            background: '#7c3aed',
            color:      '#fff',
            fontSize:   '0.625rem',
            fontWeight: 700,
            padding:    '0.1875rem 0.5rem',
            borderRadius: '999px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}>
            Active
          </div>
        )}
        {img.is_archived && (
          <div style={{
            position:     'absolute',
            inset:        0,
            background:   'rgba(0,0,0,0.5)',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            color:        '#71717a',
            fontSize:     '0.75rem',
            fontWeight:   600,
          }}>
            Archived
          </div>
        )}
      </div>

      {/* Meta */}
      <div style={{ padding: '0.5rem 0.625rem', borderBottom: '1px solid #1c1c1e' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.625rem', color: '#52525b', fontFamily: 'monospace' }}>
            {img.aspect_ratio}
          </span>
          <span style={{ fontSize: '0.625rem', color: '#52525b' }}>{date}</span>
        </div>
        {img.image_role && (
          <div style={{ fontSize: '0.625rem', color: '#71717a', marginTop: '0.125rem' }}>
            {img.image_role}
          </div>
        )}
      </div>

      {/* Prompt preview */}
      <div style={{
        padding:       '0.375rem 0.625rem',
        fontSize:      '0.6875rem',
        color:         '#52525b',
        borderBottom:  '1px solid #1c1c1e',
        overflow:      'hidden',
        display:       '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        lineHeight:    1.4,
      } as React.CSSProperties}>
        {(img.prompt ?? '').slice(0, 100)}{(img.prompt ?? '').length > 100 ? '…' : ''}
      </div>

      {/* Actions */}
      <div style={{ padding: '0.5rem 0.625rem', display: 'flex', gap: '0.375rem' }}>
        {img.is_archived ? (
          <button
            onClick={() => onRestore(img.id)}
            disabled={!!loading}
            style={btn('#18181b', '#27272a', { flex: 1, fontSize: '0.6875rem', padding: '0.375rem' })}
          >
            {isLoading ? '…' : '↩ Restore'}
          </button>
        ) : (
          <>
            {!img.is_active && (
              <button
                onClick={() => onActivate(img.id)}
                disabled={!!loading}
                style={btn('#7c3aed', '#6d28d9', { flex: 1, fontSize: '0.6875rem', padding: '0.375rem' })}
              >
                {isLoading ? '…' : '✓ Use this'}
              </button>
            )}
            <button
              onClick={() => onArchive(img.id)}
              disabled={!!loading}
              title="Archive"
              style={btn('#1c1c1e', '#27272a', { fontSize: '0.6875rem', padding: '0.375rem', width: 'auto', flex: img.is_active ? 1 : undefined })}
            >
              {isLoading ? '…' : img.is_active ? '⚠ Archive active' : '🗑'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-component: Image gallery panel ────────────────────────────────────────

function ImageGallery({
  sectionId,
  onImageActivated,
}: {
  sectionId:       string
  onImageActivated: (url: string) => void
}) {
  const [images,       setImages]       = useState<WebsiteGeneratedImage[]>([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [actionId,     setActionId]     = useState<string | null>(null)
  const [showArchived, setShowArchived] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await getSectionImages(sectionId, { includeArchived: true })
      setImages(res.images)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load images')
    } finally {
      setLoading(false)
    }
  }, [sectionId])

  useEffect(() => { void reload() }, [reload])

  const handleActivate = useCallback(async (imageId: string) => {
    setActionId(imageId)
    try {
      const res = await activateSectionImage(sectionId, imageId)
      onImageActivated(res.publicUrl)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to activate')
    } finally {
      setActionId(null)
    }
  }, [sectionId, onImageActivated, reload])

  const handleArchive = useCallback(async (imageId: string) => {
    setActionId(imageId)
    try {
      await archiveSectionImage(sectionId, imageId)
      await reload()
    } catch (e) {
      if (e instanceof Error && e.message.includes('only active image')) {
        setError('This is the only image. Generate more before archiving.')
      } else {
        setError(e instanceof Error ? e.message : 'Failed to archive')
      }
    } finally {
      setActionId(null)
    }
  }, [sectionId, reload])

  const handleRestore = useCallback(async (imageId: string) => {
    setActionId(imageId)
    try {
      await restoreSectionImage(sectionId, imageId)
      await reload()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to restore')
    } finally {
      setActionId(null)
    }
  }, [sectionId, reload])

  const visible = showArchived ? images : images.filter(i => !i.is_archived)

  if (loading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#52525b', fontSize: '0.75rem' }}>
        Loading images…
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: '#f87171', background: 'rgba(239,68,68,0.08)', borderRadius: '0.375rem', marginTop: '0.5rem' }}>
        {error}
        <button onClick={() => setError(null)} style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: '0.75rem' }}>✕</button>
      </div>
    )
  }

  if (visible.length === 0) {
    return (
      <div style={{ padding: '0.75rem 0', textAlign: 'center', color: '#52525b', fontSize: '0.75rem' }}>
        No images generated yet. Use the buttons above to generate.
      </div>
    )
  }

  return (
    <div>
      {images.some(i => i.is_archived) && (
        <button
          onClick={() => setShowArchived(p => !p)}
          style={{ background: 'none', border: 'none', color: '#52525b', fontSize: '0.6875rem', cursor: 'pointer', padding: '0.25rem 0', marginBottom: '0.5rem' }}
        >
          {showArchived ? '▲ Hide archived' : `▼ Show archived (${images.filter(i => i.is_archived).length})`}
        </button>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        {visible.map(img => (
          <ImageCard
            key={img.id}
            img={img}
            onActivate={handleActivate}
            onArchive={handleArchive}
            onRestore={handleRestore}
            loading={actionId}
          />
        ))}
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export function EditorSidebar() {
  const {
    selectedSectionId,
    selectSection,
    sections,
    toggleSectionVisibility,
    updateSectionContent,
    saveStatus,
    tenantId,
  } = useBuilderStore()

  // ── AI image state ─────────────────────────────────────────────────────────
  const [aiImage, setAiImage]         = useState<AiImageState>({ loading: false, publicUrl: null, error: null, applied: false })
  const [showDebug, setShowDebug]     = useState(false)
  const [debugInfo, setDebugInfo]     = useState<Record<string, unknown> | null>(null)
  const [showGallery, setShowGallery]         = useState(false)
  const [showPremiumDesign, setShowPremiumDesign] = useState(false)
  const [generateCount, setGenCount]          = useState<1 | 3 | 5>(1)
  const [galleryKey, setGalleryKey]           = useState(0)   // increment to force gallery reload

  if (!selectedSectionId) return null

  const section = sections.find((s) => s.id === selectedSectionId)
  if (!section) return null

  const meta            = SECTION_TYPE_MAP.get(section.section_type)
  const canGenerateImage = IMAGE_CAPABLE_SECTIONS.has(section.section_type)

  // ── Generate handler ───────────────────────────────────────────────────────

  const handleGenerateAiImage = useCallback(async (overwrite = false) => {
    if (!tenantId) return
    setAiImage({ loading: true, publicUrl: null, error: null, applied: false, imageCount: generateCount })
    setDebugInfo(null)

    try {
      const result = await generateSectionAiImage(section.id, tenantId, {
        imageCount:              generateCount,
        overwriteExistingImages: overwrite,
      })

      if (result.error) {
        // User-friendly aspect ratio error
        const friendlyErr = result.error.includes('aspectRatio') || result.error.includes('aspect_ratio')
          ? 'The image shape was invalid and was corrected. Please try generating again.'
          : result.error
        setAiImage({ loading: false, publicUrl: null, error: friendlyErr, applied: false })
        return
      }

      setAiImage({
        loading:    false,
        publicUrl:  result.publicUrl,
        error:      null,
        applied:    result.applied,
        imageCount: generateCount,
      })

      if (result.updatedSection && result.applied) {
        updateSectionContent(result.updatedSection.id, result.updatedSection.content as Record<string, unknown>)
      }

      const resultAny = result as unknown as Record<string, unknown>
      if (resultAny._debug) setDebugInfo(resultAny._debug as Record<string, unknown>)

      // Refresh gallery
      setGalleryKey(k => k + 1)
    } catch (err) {
      setAiImage({
        loading:   false,
        publicUrl: null,
        error:     err instanceof Error ? err.message : 'Image generation failed',
        applied:   false,
      })
    }
  }, [section.id, tenantId, updateSectionContent, generateCount])

  const handleRegenerate = useCallback(() => {
    setAiImage({ loading: false, publicUrl: null, error: null, applied: false })
    void handleGenerateAiImage(true)
  }, [handleGenerateAiImage])

  const handleImageActivated = useCallback((url: string) => {
    setAiImage(prev => ({ ...prev, publicUrl: url, applied: true }))
  }, [])

  // ─────────────────────────────────────────────────────────────────────────
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

      {/* ── Header ── */}
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
            width:          28, height: 28,
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

      {/* ── Visibility toggle ── */}
      <div style={{ padding: '0.75rem 1.25rem', borderBottom: '1px solid #27272a' }}>
        <Toggle
          label="Section Visible"
          value={section.is_visible}
          onChange={() => toggleSectionVisibility(section.id)}
        />
      </div>

      {/* ── AI Images panel ── */}
      {canGenerateImage && (
        <div style={{
          borderBottom: '1px solid #27272a',
          background:   '#0c0c0e',
        }}>
          {/* Panel header */}
          <button
            onClick={() => setShowGallery(p => !p)}
            style={{
              width:          '100%',
              padding:        '0.75rem 1.25rem',
              background:     'none',
              border:         'none',
              cursor:         'pointer',
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'space-between',
              color:          '#a1a1aa',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              ✨ AI Images
            </span>
            <span style={{ fontSize: '0.625rem', color: '#3f3f46' }}>
              {showGallery ? '▲ collapse' : '▼ expand'}
            </span>
          </button>

          {showGallery && (
            <div style={{ padding: '0 1.25rem 1rem' }}>

              {/* Active image preview */}
              {aiImage.publicUrl && (
                <div style={{ marginBottom: '0.75rem', borderRadius: '0.5rem', overflow: 'hidden', border: '1px solid #27272a' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={aiImage.publicUrl}
                    alt="Active AI generated image"
                    style={{ width: '100%', display: 'block', maxHeight: 160, objectFit: 'cover' }}
                  />
                  <div style={{ padding: '0.375rem 0.625rem', background: '#18181b', fontSize: '0.6875rem', color: '#52525b', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{aiImage.applied ? '✓ Applied to section' : '⏳ Preview only'}</span>
                    {aiImage.imageCount && aiImage.imageCount > 1 && (
                      <span>{aiImage.imageCount} images generated</span>
                    )}
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
                  display:      'flex',
                  gap:          '0.5rem',
                  alignItems:   'flex-start',
                }}>
                  <span style={{ flex: 1 }}>{aiImage.error}</span>
                  <button onClick={() => setAiImage(p => ({ ...p, error: null }))} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', lineHeight: 1, padding: 0 }}>✕</button>
                </div>
              )}

              {/* Count selector */}
              {!aiImage.loading && (
                <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '0.625rem' }}>
                  <span style={{ fontSize: '0.6875rem', color: '#52525b', alignSelf: 'center', whiteSpace: 'nowrap' }}>Generate:</span>
                  {([1, 3, 5] as const).map(n => (
                    <button
                      key={n}
                      onClick={() => setGenCount(n)}
                      style={{
                        padding:      '0.25rem 0.625rem',
                        borderRadius: '0.375rem',
                        border:       generateCount === n ? '1px solid #7c3aed' : '1px solid #27272a',
                        background:   generateCount === n ? 'rgba(124,58,237,0.15)' : 'transparent',
                        color:        generateCount === n ? '#a78bfa' : '#71717a',
                        fontSize:     '0.6875rem',
                        fontWeight:   600,
                        cursor:       'pointer',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}

              {/* Generate / Loading / Regenerate buttons */}
              {aiImage.loading ? (
                <div style={{
                  display:      'flex',
                  alignItems:   'center',
                  gap:          '0.5rem',
                  padding:      '0.625rem 0.875rem',
                  borderRadius: '0.375rem',
                  background:   'rgba(124,58,237,0.1)',
                  border:       '1px solid rgba(124,58,237,0.2)',
                  fontSize:     '0.8125rem',
                  color:        '#a78bfa',
                }}>
                  <span style={{ display: 'inline-block' }}>⏳</span>
                  Generating {generateCount > 1 ? `${generateCount} images` : 'image'} with Imagen 4…
                </div>
              ) : (
                <div style={row()}>
                  {!aiImage.publicUrl ? (
                    <button
                      onClick={() => void handleGenerateAiImage(false)}
                      style={btn('#7c3aed', '#6d28d9')}
                    >
                      ✨ Generate AI Image{generateCount > 1 ? ` ×${generateCount}` : ''}
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={handleRegenerate}
                        style={btn('#3f3f46', '#52525b', { flex: 1, fontSize: '0.75rem' })}
                      >
                        🔄 Regenerate{generateCount > 1 ? ` ×${generateCount}` : ''}
                      </button>
                      <button
                        onClick={() => void handleGenerateAiImage(false)}
                        style={btn('#1c1c1e', '#27272a', { fontSize: '0.75rem', flex: 1 })}
                        title="Add new without replacing active"
                      >
                        + Add more
                      </button>
                      <button
                        onClick={() => setShowDebug(p => !p)}
                        style={btn('#1c1c1e', '#27272a', { padding: '0.5rem 0.625rem', fontSize: '0.75rem', width: 'auto', flex: undefined })}
                        title="Image context debug"
                      >
                        🔍
                      </button>
                    </>
                  )}
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
                  <p style={{ margin: '0 0 0.375rem', color: '#a1a1aa', fontWeight: 600, fontFamily: 'Inter, sans-serif' }}>Image Context</p>
                  {typeof debugInfo.aspectRatioNote === 'string' && debugInfo.aspectRatioNote && (
                    <div style={{ marginBottom: '0.5rem', padding: '0.375rem', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: '0.25rem', color: '#fbbf24', lineHeight: 1.4 }}>
                      {String(debugInfo.aspectRatioNote)}
                    </div>
                  )}
                  {Object.entries(debugInfo)
                    .filter(([k]) => k !== 'aspectRatioNote')
                    .map(([k, v]) => (
                      <div key={k} style={{ marginBottom: '0.125rem' }}>
                        <span style={{ color: '#52525b' }}>{k}:</span>{' '}
                        <span style={{ color: '#a1a1aa' }}>
                          {Array.isArray(v) ? v.join(', ') : String(v)}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {/* Divider */}
              <div style={{ borderTop: '1px solid #1c1c1e', margin: '0.875rem 0 0.625rem' }} />

              {/* Gallery heading */}
              <p style={{ margin: '0 0 0.625rem', fontSize: '0.6875rem', fontWeight: 600, color: '#52525b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Generated Images
              </p>

              {/* Gallery grid */}
              <ImageGallery
                key={galleryKey}
                sectionId={section.id}
                onImageActivated={handleImageActivated}
              />
            </div>
          )}
        </div>
      )}

      {/* ── AI Premium Design panel ── */}
      {tenantId && (
        <div style={{ borderBottom: '1px solid #27272a', background: '#0b0b0d' }}>
          <button
            onClick={() => setShowPremiumDesign(p => !p)}
            style={{
              width: '100%', padding: '0.75rem 1.25rem', background: 'none',
              border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'space-between', color: '#a78bfa',
            }}
          >
            <span style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span>✦</span> AI Premium Design
            </span>
            <span style={{ fontSize: '0.75rem', color: '#52525b' }}>{showPremiumDesign ? '▲' : '▼'}</span>
          </button>
          {showPremiumDesign && (
            <div style={{ padding: '0 1.25rem 1.25rem' }}>
              <AiPremiumDesignPanel
                tenantId={tenantId}
                sectionId={section.id}
                pageId={null}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Section-specific editor ── */}
      <div style={{ padding: '1.25rem', flex: 1 }}>
        {renderEditor(section.section_type, section.id)}
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding:    '0.75rem 1.25rem',
        borderTop:  '1px solid #27272a',
        position:   'sticky',
        bottom:     0,
        background: '#111113',
      }}>
        <p style={{
          margin:   0,
          fontSize: '0.75rem',
          color: saveStatus === 'saving' ? '#f59e0b'
               : saveStatus === 'saved'  ? '#22c55e'
               : '#52525b',
        }}>
          {saveStatus === 'saving' ? '● Saving…'
         : saveStatus === 'saved'  ? '✓ Saved'
         : '○ Ready'}
        </p>
      </div>
    </div>
  )
}

// ── Stub to satisfy pre-existing imports ──────────────────────────────────────
function aiButtonStyle(bg: string, _hover: string): React.CSSProperties {
  return btn(bg, _hover)
}
export { aiButtonStyle }
