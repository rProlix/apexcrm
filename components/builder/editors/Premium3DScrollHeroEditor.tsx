'use client'

// components/builder/editors/Premium3DScrollHeroEditor.tsx
// Sidebar editor for the premium_3d_scroll_hero section.
// Owner/admin only — never ships to public visitors.

import { useCallback, useEffect, useState } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { Field, Select, Toggle, Textarea, inputStyle } from './FormFields'
import {
  uploadWebsite3DAsset,
  getWebsite3DAssets,
  uploadSectionImage,
  type Website3DAsset,
} from '@/lib/builder/api'
import {
  normalizeScrollHeroContent,
  type Premium3DScrollHeroContent,
  type ScrollHeroPalette,
} from '@/lib/website/premium3d/types'
import { INDUSTRY_PRESETS, buildContentFromPreset } from '@/lib/website/premium3d/presets'

interface Props { sectionId: string }

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.375rem',
}
const groupStyle: React.CSSProperties = { marginBottom: '1rem' }
const sectionHead: React.CSSProperties = {
  margin: '1.5rem 0 0.75rem', fontSize: '0.6875rem', fontWeight: 700,
  color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em',
}

export function Premium3DScrollHeroEditor({ sectionId }: Props) {
  const { sections, updateSectionContent } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  const tenantId = (section as Record<string, unknown> | undefined)?.tenant_id as string | undefined

  const content: Premium3DScrollHeroContent = normalizeScrollHeroContent(section?.content)

  const [uploading, setUploading] = useState<string | null>(null)
  const [library, setLibrary] = useState<Website3DAsset[]>([])
  const [seqText, setSeqText] = useState((content.imageSequenceUrls ?? []).join('\n'))

  const patch = useCallback((changes: Partial<Premium3DScrollHeroContent>) => {
    if (!section) return
    updateSectionContent(sectionId, { ...section.content, ...changes } as Record<string, unknown>)
  }, [section, sectionId, updateSectionContent])

  const patchPalette = useCallback((key: keyof ScrollHeroPalette, value: string) => {
    const next = { ...(content.palette as ScrollHeroPalette), [key]: value }
    patch({ palette: next })
  }, [content.palette, patch])

  useEffect(() => {
    if (!tenantId) return
    void getWebsite3DAssets(tenantId).then(setLibrary).catch(() => {})
  }, [tenantId])

  const handleUpload = useCallback(async (
    file: File,
    assetType: string,
    field: keyof Premium3DScrollHeroContent,
  ) => {
    if (!tenantId) return
    setUploading(field as string)
    try {
      const res = await uploadWebsite3DAsset(file, tenantId, assetType)
      if (res?.url) {
        patch({ [field]: res.url } as Partial<Premium3DScrollHeroContent>)
        void getWebsite3DAssets(tenantId).then(setLibrary).catch(() => {})
      }
    } finally {
      setUploading(null)
    }
  }, [tenantId, patch])

  const handleImageUpload = useCallback(async (
    file: File,
    field: keyof Premium3DScrollHeroContent,
  ) => {
    if (!tenantId) return
    setUploading(field as string)
    try {
      const url = await uploadSectionImage(file, tenantId)
      if (url) patch({ [field]: url } as Partial<Premium3DScrollHeroContent>)
    } finally {
      setUploading(null)
    }
  }, [tenantId, patch])

  if (!section) return null

  const isThree = content.renderMode === 'three_model'

  return (
    <div>
      {/* ── Industry preset ── */}
      <div style={groupStyle}>
        <label style={labelStyle}>Industry preset</label>
        <Select
          value={content.presetKey ?? ''}
          onChange={(v) => {
            if (!v) return
            const next = buildContentFromPreset(v, content)
            patch(next)
          }}
          options={[
            { value: '', label: '— Choose a starting preset —' },
            ...INDUSTRY_PRESETS.map((p) => ({ value: p.key, label: p.label })),
          ]}
        />
        {content.presetKey && (
          <p style={{ fontSize: '0.6875rem', color: '#71717a', marginTop: '0.375rem' }}>
            {INDUSTRY_PRESETS.find((p) => p.key === content.presetKey)?.assetNeeded}
          </p>
        )}
      </div>

      {/* ── Render mode ── */}
      <div style={groupStyle}>
        <label style={labelStyle}>Render mode</label>
        <Select
          value={content.renderMode}
          onChange={(v) => patch({ renderMode: v === 'video_scrub' ? 'video_scrub' : 'three_model' })}
          options={[
            { value: 'three_model', label: 'Three.js 3D Model' },
            { value: 'video_scrub', label: 'Video / Image Scroll Scrub' },
          ]}
        />
      </div>

      {/* ── Copy ── */}
      <h4 style={sectionHead}>Content</h4>
      <div style={groupStyle}>
        <label style={labelStyle}>Eyebrow</label>
        <input style={inputStyle} value={content.eyebrow ?? ''} onChange={(e) => patch({ eyebrow: e.target.value })} />
      </div>
      <div style={groupStyle}>
        <label style={labelStyle}>Headline</label>
        <input style={inputStyle} value={content.headline} onChange={(e) => patch({ headline: e.target.value })} />
      </div>
      <div style={groupStyle}>
        <label style={labelStyle}>Subheadline</label>
        <Textarea value={content.subheadline ?? ''} onChange={(v) => patch({ subheadline: v })} rows={2} />
      </div>
      <div style={groupStyle}>
        <label style={labelStyle}>Primary CTA (label / link)</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input style={inputStyle} placeholder="Label" value={content.ctaPrimary?.label ?? ''}
            onChange={(e) => patch({ ctaPrimary: { label: e.target.value, href: content.ctaPrimary?.href ?? '#' } })} />
          <input style={inputStyle} placeholder="#link" value={content.ctaPrimary?.href ?? ''}
            onChange={(e) => patch({ ctaPrimary: { label: content.ctaPrimary?.label ?? 'Get Started', href: e.target.value } })} />
        </div>
      </div>
      <div style={groupStyle}>
        <label style={labelStyle}>Secondary CTA (label / link)</label>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input style={inputStyle} placeholder="Label" value={content.ctaSecondary?.label ?? ''}
            onChange={(e) => patch({ ctaSecondary: e.target.value ? { label: e.target.value, href: content.ctaSecondary?.href ?? '#' } : null })} />
          <input style={inputStyle} placeholder="#link" value={content.ctaSecondary?.href ?? ''}
            onChange={(e) => patch({ ctaSecondary: { label: content.ctaSecondary?.label ?? 'Learn More', href: e.target.value } })} />
        </div>
      </div>

      {/* ── Assets ── */}
      <h4 style={sectionHead}>Assets</h4>

      {isThree ? (
        <>
          <FileUploadRow
            label="3D Model (GLB / GLTF)"
            accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
            uploading={uploading === 'modelUrl'}
            currentUrl={content.modelUrl}
            onFile={(f) => handleUpload(f, f.name.toLowerCase().endsWith('.gltf') ? 'gltf' : 'glb', 'modelUrl')}
            onClear={() => patch({ modelUrl: null })}
          />
          <FileUploadRow
            label="Environment / HDR (optional)"
            accept=".hdr,.exr,.jpg,.png,.webp"
            uploading={uploading === 'environmentUrl'}
            currentUrl={content.environmentUrl}
            onFile={(f) => handleUpload(f, 'environment', 'environmentUrl')}
            onClear={() => patch({ environmentUrl: null })}
          />
          <FileUploadRow
            label="Fallback image"
            accept="image/*"
            uploading={uploading === 'fallbackImageUrl'}
            currentUrl={content.fallbackImageUrl}
            onFile={(f) => handleImageUpload(f, 'fallbackImageUrl')}
            onClear={() => patch({ fallbackImageUrl: null })}
          />
          <SpecHint lines={[
            'GLB preferred (single compressed file).',
            'Keep model size reasonable (<25 MB).',
            'Name groups stage_foundation…stage_finished for staged reveals.',
            'Always set a fallback image.',
          ]} />
        </>
      ) : (
        <>
          <div style={groupStyle}>
            <Toggle
              label="Use image sequence (frame-perfect)"
              value={!!content.useImageSequence}
              onChange={(v) => patch({ useImageSequence: v })}
            />
          </div>

          {content.useImageSequence ? (
            <div style={groupStyle}>
              <label style={labelStyle}>Image sequence frame URLs (one per line, in order)</label>
              <Textarea
                value={seqText}
                rows={5}
                placeholder="https://…/frame_001.webp&#10;https://…/frame_002.webp"
                onChange={(v) => {
                  setSeqText(v)
                  const urls = v.split('\n').map((s) => s.trim()).filter(Boolean)
                  patch({ imageSequenceUrls: urls })
                }}
              />
              <FileUploadRow
                label="Add a frame (uploads & appends)"
                accept="image/webp,image/jpeg,image/png"
                uploading={uploading === 'imageSequenceUrls'}
                onFile={async (f) => {
                  if (!tenantId) return
                  setUploading('imageSequenceUrls')
                  try {
                    const res = await uploadWebsite3DAsset(f, tenantId, 'image_sequence')
                    if (res?.url) {
                      const urls = [...(content.imageSequenceUrls ?? []), res.url]
                      setSeqText(urls.join('\n'))
                      patch({ imageSequenceUrls: urls })
                    }
                  } finally { setUploading(null) }
                }}
              />
            </div>
          ) : (
            <FileUploadRow
              label="Video (H.264 MP4)"
              accept="video/mp4,.mp4"
              uploading={uploading === 'videoUrl'}
              currentUrl={content.videoUrl}
              onFile={(f) => handleUpload(f, 'video', 'videoUrl')}
              onClear={() => patch({ videoUrl: null })}
            />
          )}

          <FileUploadRow
            label="Poster image (required)"
            accept="image/*"
            uploading={uploading === 'posterUrl'}
            currentUrl={content.posterUrl}
            onFile={(f) => handleImageUpload(f, 'posterUrl')}
            onClear={() => patch({ posterUrl: null })}
          />
          <FileUploadRow
            label="Fallback image"
            accept="image/*"
            uploading={uploading === 'fallbackImageUrl'}
            currentUrl={content.fallbackImageUrl}
            onFile={(f) => handleImageUpload(f, 'fallbackImageUrl')}
            onClear={() => patch({ fallbackImageUrl: null })}
          />
          <div style={groupStyle}>
            <label style={labelStyle}>Mobile fallback behaviour</label>
            <Select
              value={content.mobileFallbackMode ?? 'poster'}
              onChange={(v) => patch({ mobileFallbackMode: v as Premium3DScrollHeroContent['mobileFallbackMode'] })}
              options={[
                { value: 'poster', label: 'Show poster (lightest)' },
                { value: 'staticImage', label: 'Static fallback image' },
                { value: 'lowRes', label: 'Low-res scrub' },
                { value: 'fullScrub', label: 'Full scrub on mobile' },
              ]}
            />
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Video fit</label>
            <Select
              value={content.videoObjectFit ?? 'cover'}
              onChange={(v) => patch({ videoObjectFit: v as Premium3DScrollHeroContent['videoObjectFit'] })}
              options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }]}
            />
          </div>
          <SpecHint lines={[
            'MP4 H.264, muted, no audio required.',
            '1080p max by default; short progression clip.',
            'Poster image required.',
            'Image sequence recommended for frame-perfect scroll.',
          ]} />
        </>
      )}

      {/* Library picker */}
      {library.length > 0 && (
        <div style={groupStyle}>
          <label style={labelStyle}>Select from 3D asset library</label>
          <Select
            value=""
            onChange={(url) => {
              if (!url) return
              const asset = library.find((a) => a.public_url === url)
              if (!asset) return
              if (asset.asset_type === 'glb' || asset.asset_type === 'gltf') patch({ modelUrl: url, renderMode: 'three_model' })
              else if (asset.asset_type === 'video') patch({ videoUrl: url, renderMode: 'video_scrub' })
              else if (asset.asset_type === 'poster') patch({ posterUrl: url })
              else if (asset.asset_type === 'fallback') patch({ fallbackImageUrl: url })
              else if (asset.asset_type === 'environment') patch({ environmentUrl: url })
            }}
            options={[
              { value: '', label: `— ${library.length} asset(s) available —` },
              ...library.filter((a) => a.public_url).map((a) => ({ value: a.public_url as string, label: `${a.asset_type} · ${a.name}` })),
            ]}
          />
        </div>
      )}

      {/* ── Scene controls ── */}
      <h4 style={sectionHead}>Scene & motion</h4>

      {isThree && (
        <>
          <RangeRow label="Model scale" min={0.1} max={4} step={0.1} value={content.modelScale ?? 1}
            onChange={(v) => patch({ modelScale: v })} />
          <RangeRow label="Rotation amount (final Y angle, turns)" min={0} max={3} step={0.25}
            value={Number(((content.targetRotation?.y ?? Math.PI * 2) / (Math.PI * 2)).toFixed(2))}
            onChange={(v) => patch({ targetRotation: { x: content.targetRotation?.x ?? 0, y: v * Math.PI * 2, z: content.targetRotation?.z ?? 0 } })} />
          <RangeRow label="Camera zoom" min={0.5} max={2} step={0.05} value={content.cameraZoom ?? 1}
            onChange={(v) => patch({ cameraZoom: v })} />
          <div style={groupStyle}>
            <label style={labelStyle}>Camera path</label>
            <Select value={content.cameraPath ?? 'orbit'}
              onChange={(v) => patch({ cameraPath: v as Premium3DScrollHeroContent['cameraPath'] })}
              options={['static', 'orbit', 'dollyIn', 'craneUp', 'arc'].map((o) => ({ value: o, label: o }))} />
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Lighting preset</label>
            <Select value={content.lightingPreset ?? 'studioSoftbox'}
              onChange={(v) => patch({ lightingPreset: v as Premium3DScrollHeroContent['lightingPreset'] })}
              options={['studioSoftbox', 'premiumSpotlight', 'outdoorConstruction', 'luxuryGlow', 'showroom'].map((o) => ({ value: o, label: o }))} />
          </div>
          <RangeRow label="Shadow intensity" min={0} max={1} step={0.05} value={content.shadowIntensity ?? 0.6}
            onChange={(v) => patch({ shadowIntensity: v })} />
          <div style={groupStyle}>
            <label style={labelStyle}>Environment style</label>
            <Select value={content.environmentPreset ?? 'studio'}
              onChange={(v) => patch({ environmentPreset: v as Premium3DScrollHeroContent['environmentPreset'] })}
              options={['none', 'studio', 'city', 'warehouse', 'sunset', 'dawn', 'night'].map((o) => ({ value: o, label: o }))} />
          </div>
          <div style={groupStyle}>
            <label style={labelStyle}>Stage reveal mode</label>
            <Select value={content.stageRevealMode ?? 'none'}
              onChange={(v) => patch({ stageRevealMode: v as Premium3DScrollHeroContent['stageRevealMode'] })}
              options={['none', 'sequential', 'crossfade'].map((o) => ({ value: o, label: o }))} />
          </div>
        </>
      )}

      <RangeRow label="Scroll length (× viewport height)" min={1} max={6} step={0.5} value={content.scrollLength ?? 2.5}
        onChange={(v) => patch({ scrollLength: v })} />
      <RangeRow label="Scrub smoothing" min={0} max={1} step={0.02} value={content.scrubSmoothing ?? 0.12}
        onChange={(v) => patch({ scrubSmoothing: v })} />
      <div style={groupStyle}>
        <Toggle label="Pin hero while scrolling" value={content.pinOnScroll !== false}
          onChange={(v) => patch({ pinOnScroll: v })} />
      </div>

      {/* ── Text & effects ── */}
      <h4 style={sectionHead}>Headline & effects</h4>
      <div style={groupStyle}>
        <label style={labelStyle}>Headline animation</label>
        <Select value={content.textAnimation ?? 'fadeUpWords'}
          onChange={(v) => patch({ textAnimation: v as Premium3DScrollHeroContent['textAnimation'] })}
          options={['fadeUpWords', 'blurReveal', 'scaleWords', 'luxurySplit', 'none'].map((o) => ({ value: o, label: o }))} />
      </div>
      <div style={groupStyle}>
        <label style={labelStyle}>Shader / distortion preset</label>
        <Select value={content.shaderPreset ?? 'none'}
          onChange={(v) => patch({ shaderPreset: v as Premium3DScrollHeroContent['shaderPreset'] })}
          options={['none', 'liquidReveal', 'softGlass', 'heatWave', 'premiumGlow', 'pageRipple', 'productAura'].map((o) => ({ value: o, label: o }))} />
      </div>

      {/* ── Accessibility ── */}
      <h4 style={sectionHead}>Accessibility & fallback</h4>
      <div style={groupStyle}>
        <label style={labelStyle}>Reduced-motion fallback</label>
        <Select value={content.reducedMotionFallback ?? 'poster'}
          onChange={(v) => patch({ reducedMotionFallback: v as Premium3DScrollHeroContent['reducedMotionFallback'] })}
          options={[
            { value: 'poster', label: 'Poster image' },
            { value: 'staticImage', label: 'Static fallback image' },
            { value: 'firstFrame', label: 'First frame' },
          ]} />
      </div>

      {/* ── Palette ── */}
      <h4 style={sectionHead}>Section palette</h4>
      <div style={groupStyle}>
        <Toggle label="Apply palette to whole site while in view" value={!!content.applyPaletteGlobally}
          onChange={(v) => patch({ applyPaletteGlobally: v })} />
      </div>
      {(['background', 'foreground', 'accent', 'muted', 'glow'] as (keyof ScrollHeroPalette)[]).map((key) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.8125rem', color: '#a1a1aa', textTransform: 'capitalize' }}>{key}</span>
          <input
            type="color"
            value={content.palette?.[key] ?? '#000000'}
            onChange={(e) => patchPalette(key, e.target.value)}
            style={{ width: 40, height: 28, border: '1px solid #3f3f46', borderRadius: '0.375rem', background: 'transparent', cursor: 'pointer' }}
          />
        </div>
      ))}

      <div style={{
        marginTop: '1.25rem', padding: '0.75rem', borderRadius: '0.5rem',
        background: '#1e1b4b33', border: '1px solid #3730a344',
        fontSize: '0.75rem', color: '#c084fc', lineHeight: 1.5,
      }}>
        No Spline required. This hero uses Three.js (3D models) or H.264 MP4 /
        image-sequence scroll-scrubbing. Missing assets fall back to a premium
        gradient automatically.
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FileUploadRow({
  label, accept, uploading, currentUrl, onFile, onClear,
}: {
  label: string
  accept: string
  uploading: boolean
  currentUrl?: string | null
  onFile: (file: File) => void
  onClear?: () => void
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label style={{
          flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: '0.5rem', borderRadius: '0.5rem', border: '1px dashed #3f3f46',
          background: '#18181b', color: '#a1a1aa', fontSize: '0.75rem', cursor: 'pointer',
        }}>
          {uploading ? 'Uploading…' : currentUrl ? 'Replace file' : 'Upload file'}
          <input
            type="file"
            accept={accept}
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = '' }}
          />
        </label>
        {currentUrl && onClear && (
          <button onClick={onClear} style={{
            padding: '0.5rem 0.625rem', borderRadius: '0.5rem', border: '1px solid #3f3f46',
            background: 'transparent', color: '#71717a', cursor: 'pointer', fontSize: '0.75rem',
          }}>Clear</button>
        )}
      </div>
      {currentUrl && (
        <p style={{ fontSize: '0.625rem', color: '#52525b', marginTop: '0.25rem', wordBreak: 'break-all' }}>
          {currentUrl.slice(0, 70)}{currentUrl.length > 70 ? '…' : ''}
        </p>
      )}
    </div>
  )
}

function RangeRow({
  label, min, max, step, value, onChange,
}: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <label style={labelStyle}>{label}</label>
        <span style={{ fontSize: '0.6875rem', color: '#71717a' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#c9a84c' }} />
    </div>
  )
}

function SpecHint({ lines }: { lines: string[] }) {
  return (
    <ul style={{ margin: '0 0 1rem', padding: '0 0 0 1rem', fontSize: '0.6875rem', color: '#71717a', lineHeight: 1.5 }}>
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  )
}
