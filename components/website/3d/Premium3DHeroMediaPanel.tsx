'use client'

// components/website/3d/Premium3DHeroMediaPanel.tsx
//
// "Premium 3D Scroll Hero Media Manager" — the builder UI for uploading,
// selecting, activating, and configuring the VIDEO / IMAGE-SEQUENCE hero media
// for a premium_3d_scroll_hero section.
//
// It edits the section's DRAFT content through the builder store (optimistic +
// autosaved). Activating an asset flips its is_active flag server-side and
// merges the returned contentPatch into the draft. NO Spline anywhere.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { Select, Toggle } from '@/components/builder/editors/FormFields'
import {
  uploadWebsite3DAsset,
  getWebsite3DAssets,
  activateWebsite3DAsset,
  deleteWebsite3DAsset,
  type Website3DAsset,
} from '@/lib/builder/api'
import {
  normalizeScrollHeroContent,
  type Premium3DScrollHeroContent,
  type VideoScrubSettings,
} from '@/lib/website/premium3d/types'

interface Props { sectionId: string }

const label: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.375rem' }
const group: React.CSSProperties = { marginBottom: '1rem' }
const head: React.CSSProperties = {
  margin: '1.25rem 0 0.75rem', fontSize: '0.6875rem', fontWeight: 700,
  color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em',
}

export function Premium3DHeroMediaPanel({ sectionId }: Props) {
  const { sections, updateSectionContent, tenantId: ctxTenant } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  const tenantId =
    ctxTenant ||
    ((section as Record<string, unknown> | undefined)?.tenant_id as string | undefined) ||
    ''

  const content: Premium3DScrollHeroContent = normalizeScrollHeroContent(section?.content)
  const scrub: VideoScrubSettings = content.videoScrub!

  const [library, setLibrary] = useState<Website3DAsset[]>([])
  const [uploading, setUploading] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(() => {
    if (!tenantId) return
    void getWebsite3DAssets(tenantId, { renderMode: 'video_scrub' })
      .then(setLibrary)
      .catch(() => {})
  }, [tenantId])

  useEffect(() => { refresh() }, [refresh])

  const patch = useCallback((changes: Partial<Premium3DScrollHeroContent>) => {
    if (!section) return
    updateSectionContent(sectionId, { ...section.content, ...changes } as Record<string, unknown>)
  }, [section, sectionId, updateSectionContent])

  const patchScrub = useCallback((changes: Partial<VideoScrubSettings>) => {
    patch({ videoScrub: { ...scrub, ...changes } })
  }, [patch, scrub])

  // ── Uploads (scoped to this section, render_mode video_scrub) ──
  const doUpload = useCallback(async (
    file: File,
    assetType: string,
    apply?: (url: string, asset: Website3DAsset | null) => void,
  ) => {
    if (!tenantId) return
    setUploading(assetType)
    setNotice(null)
    try {
      const res = await uploadWebsite3DAsset(file, tenantId, {
        assetType,
        sectionId,
        renderMode: 'video_scrub',
      })
      if (res?.url) {
        apply?.(res.url, res.asset)
        refresh()
      } else {
        setNotice('Upload failed. Please try again.')
      }
    } finally {
      setUploading(null)
    }
  }, [tenantId, sectionId, refresh])

  // Upload many image-sequence frames at once → grouped under one sequenceId.
  const uploadFrames = useCallback(async (files: FileList) => {
    if (!tenantId || files.length === 0) return
    setUploading('image_sequence_frame')
    setNotice(null)
    try {
      const sequenceId = `seq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const sorted = Array.from(files).sort((a, b) =>
        a.name.replace(/\d+/g, (m) => m.padStart(8, '0'))
          .localeCompare(b.name.replace(/\d+/g, (m) => m.padStart(8, '0'))),
      )
      const urls: string[] = []
      for (let i = 0; i < sorted.length; i++) {
        const res = await uploadWebsite3DAsset(sorted[i], tenantId, {
          assetType: 'image_sequence_frame',
          sectionId,
          renderMode: 'video_scrub',
          sortOrder: i,
          metadata: { sequenceId, frameIndex: i, frameCount: sorted.length },
        })
        if (res?.url) urls.push(res.url)
      }
      if (urls.length > 0) {
        // Create a parent image_sequence "group" asset that references the frames.
        await uploadParentSequence(tenantId, sectionId, sequenceId, urls, sorted[0])
        patch({
          renderMode: 'video_scrub',
          useImageSequence: true,
          imageSequenceUrls: urls,
        })
        patchScrub({ mode: 'image_sequence', enabled: true })
        refresh()
      }
    } finally {
      setUploading(null)
    }
  }, [tenantId, sectionId, patch, patchScrub, refresh])

  // ── Activation ──
  const activate = useCallback(async (
    asset: Website3DAsset,
    mode: 'video' | 'image_sequence' | 'poster' | 'fallback',
  ) => {
    setBusy(true)
    setNotice(null)
    try {
      const res = await activateWebsite3DAsset(asset.id, mode, sectionId)
      if (res?.contentPatch) {
        patch(res.contentPatch as Partial<Premium3DScrollHeroContent>)
        if (mode === 'video') patchScrub({ mode: 'video', enabled: true })
        if (mode === 'image_sequence') patchScrub({ mode: 'image_sequence', enabled: true })
        setNotice('Media set as active hero. Publish the website to show it publicly.')
        refresh()
      } else {
        setNotice('Could not activate this asset.')
      }
    } finally {
      setBusy(false)
    }
  }, [sectionId, patch, patchScrub, refresh])

  const remove = useCallback(async (asset: Website3DAsset) => {
    setBusy(true)
    try {
      await deleteWebsite3DAsset(asset.id)
      refresh()
    } finally {
      setBusy(false)
    }
  }, [refresh])

  // ── Derived: which library asset is active ──
  const isActive = useCallback((asset: Website3DAsset): string | null => {
    if (asset.id && asset.id === content.activeVideoAssetId) return 'video'
    if (asset.id && asset.id === content.activeImageSequenceAssetId) return 'image sequence'
    if (asset.id && asset.id === content.posterAssetId) return 'poster'
    if (asset.id && asset.id === content.fallbackAssetId) return 'fallback'
    if (asset.public_url && asset.public_url === content.videoUrl) return 'video'
    if (asset.public_url && asset.public_url === content.posterUrl) return 'poster'
    if (asset.public_url && asset.public_url === content.fallbackImageUrl) return 'fallback'
    return null
  }, [content])

  // ── Builder validation messages ──
  const errors = useMemo(() => {
    const list: { level: 'error' | 'warn' | 'info'; msg: string }[] = []
    if (scrub.mode === 'video' && !content.videoUrl) {
      list.push({ level: 'error', msg: 'Upload a video before enabling MP4 scrub.' })
    }
    if (scrub.mode === 'image_sequence' && (content.imageSequenceUrls?.length ?? 0) < 2) {
      list.push({ level: 'error', msg: 'Upload image sequence frames before enabling image sequence scrub.' })
    }
    if (!content.posterUrl) list.push({ level: 'warn', msg: 'Poster image recommended.' })
    list.push({ level: 'info', msg: 'Media is saved in draft. Publish the website to show it publicly.' })
    return list
  }, [scrub.mode, content.videoUrl, content.imageSequenceUrls, content.posterUrl])

  if (!section) return null

  const videoAssets   = library.filter((a) => a.asset_type === 'video')
  const seqAssets     = library.filter((a) => a.asset_type === 'image_sequence')
  const posterAssets  = library.filter((a) => a.asset_type === 'poster')
  const fallbackAssets = library.filter((a) => a.asset_type === 'fallback')

  return (
    <div>
      <h4 style={head}>Video / Image Scroll Hero</h4>

      <div style={group}>
        <Toggle
          label="Enable video / image scroll hero"
          value={!!scrub.enabled}
          onChange={(v) => patchScrub({ enabled: v })}
        />
      </div>

      <div style={group}>
        <label style={label}>Scrub mode</label>
        <Select
          value={scrub.mode}
          onChange={(v) => {
            const mode = v === 'image_sequence' ? 'image_sequence' : 'video'
            patchScrub({ mode })
            patch({ renderMode: 'video_scrub', useImageSequence: mode === 'image_sequence' })
          }}
          options={[
            { value: 'video', label: 'MP4 Video (H.264)' },
            { value: 'image_sequence', label: 'Image Sequence (frame-perfect)' },
          ]}
        />
      </div>

      {/* ── Builder validation banner ── */}
      <div style={group}>
        {errors.map((e, i) => (
          <div key={i} style={{
            fontSize: '0.7rem', lineHeight: 1.4, marginBottom: '0.375rem',
            padding: '0.5rem 0.625rem', borderRadius: '0.5rem',
            background: e.level === 'error' ? '#7f1d1d33' : e.level === 'warn' ? '#78350f33' : '#1e3a8a33',
            border: `1px solid ${e.level === 'error' ? '#ef444455' : e.level === 'warn' ? '#f59e0b55' : '#3b82f655'}`,
            color: e.level === 'error' ? '#fca5a5' : e.level === 'warn' ? '#fcd34d' : '#93c5fd',
          }}>
            {e.msg}
          </div>
        ))}
      </div>

      {/* ── Uploads ── */}
      <h4 style={head}>Upload media</h4>

      {scrub.mode === 'video' ? (
        <UploadButton
          text="Upload H.264 MP4 video"
          accept="video/mp4,.mp4"
          busy={uploading === 'video'}
          onFiles={(files) => doUpload(files[0], 'video', (url, asset) => {
            patch({ renderMode: 'video_scrub', useImageSequence: false, videoUrl: url, activeVideoAssetId: asset?.id ?? null })
            patchScrub({ mode: 'video', enabled: true })
          })}
        />
      ) : (
        <UploadButton
          text="Upload image sequence frames (multi-select)"
          accept="image/webp,image/jpeg,image/png,image/avif"
          multiple
          busy={uploading === 'image_sequence_frame'}
          onFiles={(files) => uploadFrames(files)}
        />
      )}

      <UploadButton
        text="Upload poster image"
        accept="image/*"
        busy={uploading === 'poster'}
        onFiles={(files) => doUpload(files[0], 'poster', (url, asset) =>
          patch({ posterUrl: url, posterAssetId: asset?.id ?? null }))}
      />
      <UploadButton
        text="Upload fallback image"
        accept="image/*"
        busy={uploading === 'fallback'}
        onFiles={(files) => doUpload(files[0], 'fallback', (url, asset) =>
          patch({ fallbackImageUrl: url, fallbackAssetId: asset?.id ?? null }))}
      />

      {notice && (
        <p style={{ fontSize: '0.7rem', color: '#86efac', margin: '0.25rem 0 0.75rem' }}>{notice}</p>
      )}

      {/* ── Media library ── */}
      <h4 style={head}>Media library</h4>
      {library.length === 0 ? (
        <p style={{ fontSize: '0.7rem', color: '#71717a', marginBottom: '1rem' }}>
          No media uploaded for this hero yet.
        </p>
      ) : (
        <>
          <AssetGroup title="Videos" assets={videoAssets} isActive={isActive} busy={busy}
            actionLabel="Use this video" onUse={(a) => activate(a, 'video')} onDelete={remove} />
          <AssetGroup title="Image sequences" assets={seqAssets} isActive={isActive} busy={busy}
            actionLabel="Use this image sequence" onUse={(a) => activate(a, 'image_sequence')} onDelete={remove} />
          <AssetGroup title="Posters" assets={posterAssets} isActive={isActive} busy={busy}
            actionLabel="Use this poster" onUse={(a) => activate(a, 'poster')} onDelete={remove} />
          <AssetGroup title="Fallback images" assets={fallbackAssets} isActive={isActive} busy={busy}
            actionLabel="Use this fallback" onUse={(a) => activate(a, 'fallback')} onDelete={remove} />
        </>
      )}

      {/* ── Active preview ── */}
      {(content.posterUrl || content.videoUrl || (content.imageSequenceUrls?.length ?? 0) > 0) && (
        <div style={{ ...group, marginTop: '0.5rem' }}>
          <label style={label}>Active hero preview</label>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={content.posterUrl || content.fallbackImageUrl || content.imageSequenceUrls?.[0] || ''}
            alt="Active hero"
            style={{ width: '100%', borderRadius: '0.5rem', border: '1px solid #3f3f46', display: 'block' }}
          />
        </div>
      )}

      {/* ── Scrub settings ── */}
      <h4 style={head}>Scrub settings</h4>
      <div style={group}>
        <Toggle label="Pin hero while scrolling" value={scrub.pinOnScroll}
          onChange={(v) => { patchScrub({ pinOnScroll: v }); patch({ pinOnScroll: v }) }} />
      </div>
      <RangeRow label="Scroll length (× viewport height)" min={1} max={6} step={0.5}
        value={content.scrollLength ?? 2.5}
        onChange={(v) => { patch({ scrollLength: v }); patchScrub({ scrollLength: v }) }} />
      <RangeRow label="Scrub smoothing" min={0} max={1} step={0.02}
        value={content.scrubSmoothing ?? 0.12}
        onChange={(v) => { patch({ scrubSmoothing: v }); patchScrub({ scrubSmoothing: v }) }} />
      <div style={group}>
        <label style={label}>Object fit</label>
        <Select value={scrub.objectFit}
          onChange={(v) => { patchScrub({ objectFit: v as 'cover' | 'contain' }); patch({ videoObjectFit: v as 'cover' | 'contain' }) }}
          options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }]} />
      </div>
      {scrub.mode === 'video' && (
        <>
          <div style={group}>
            <label style={label}>Preload</label>
            <Select value={scrub.preload}
              onChange={(v) => patchScrub({ preload: v as 'metadata' | 'auto' | 'none' })}
              options={[
                { value: 'metadata', label: 'metadata (recommended)' },
                { value: 'auto', label: 'auto' },
                { value: 'none', label: 'none' },
              ]} />
          </div>
          <RangeRow label="Start time (s, 0 = beginning)" min={0} max={60} step={0.5}
            value={scrub.startTime ?? 0} onChange={(v) => patchScrub({ startTime: v || undefined })} />
          <RangeRow label="End time (s, 0 = full duration)" min={0} max={120} step={0.5}
            value={scrub.endTime ?? 0} onChange={(v) => patchScrub({ endTime: v || undefined })} />
        </>
      )}
      {scrub.mode === 'image_sequence' && (
        <RangeRow label="FPS (image sequence)" min={12} max={60} step={1}
          value={scrub.fps ?? 30} onChange={(v) => patchScrub({ fps: v })} />
      )}
      <div style={group}>
        <label style={label}>Mobile fallback behaviour</label>
        <Select value={scrub.mobileFallbackMode}
          onChange={(v) => { patchScrub({ mobileFallbackMode: v as VideoScrubSettings['mobileFallbackMode'] }); patch({ mobileFallbackMode: v as Premium3DScrollHeroContent['mobileFallbackMode'] }) }}
          options={[
            { value: 'poster', label: 'Show poster (lightest)' },
            { value: 'staticImage', label: 'Static fallback image' },
            { value: 'lowRes', label: 'Low-res scrub' },
            { value: 'fullScrub', label: 'Full scrub on mobile' },
          ]} />
      </div>
      <div style={group}>
        <label style={label}>Reduced-motion fallback</label>
        <Select value={scrub.reducedMotionFallback}
          onChange={(v) => { patchScrub({ reducedMotionFallback: v as VideoScrubSettings['reducedMotionFallback'] }); patch({ reducedMotionFallback: v as Premium3DScrollHeroContent['reducedMotionFallback'] }) }}
          options={[
            { value: 'poster', label: 'Poster image' },
            { value: 'staticImage', label: 'Static fallback image' },
            { value: 'firstFrame', label: 'First frame' },
          ]} />
      </div>

      {/* ── Recommended specs + FFmpeg helper ── */}
      <h4 style={head}>Recommended specs</h4>
      <ul style={{ margin: '0 0 1rem', padding: '0 0 0 1rem', fontSize: '0.6875rem', color: '#71717a', lineHeight: 1.6 }}>
        <li>MP4 H.264 recommended, muted, no audio required.</li>
        <li>1080p max recommended; short loopable/progression clip.</li>
        <li>Poster image recommended/required.</li>
        <li>Image sequence = smoother, frame-perfect scroll.</li>
        <li>Use WebP/JPG frames; 40–150 frames is ideal.</li>
        <li>Mobile visitors may receive a poster or lighter fallback.</li>
      </ul>
      <div style={{
        padding: '0.625rem 0.75rem', borderRadius: '0.5rem', background: '#09090b',
        border: '1px solid #27272a', fontSize: '0.65rem', color: '#a1a1aa', lineHeight: 1.6,
      }}>
        <div style={{ color: '#c9a84c', marginBottom: '0.25rem' }}>Convert a video to an image sequence (FFmpeg):</div>
        <code style={{ display: 'block', whiteSpace: 'pre-wrap', color: '#e4e4e7' }}>
          ffmpeg -i input.mp4 -vf fps=30,scale=1920:-1 frame_%04d.webp
        </code>
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function uploadParentSequence(
  _tenantId: string,
  _sectionId: string,
  _sequenceId: string,
  _urls: string[],
  _firstFile: File,
) {
  // The frames themselves are persisted as image_sequence_frame rows (grouped by
  // sequenceId). A parent "image_sequence" group row is optional; the section
  // content already carries the ordered URLs. Kept as a no-op hook point so a
  // future enhancement can register the group without changing callers.
  return
}

function AssetGroup({
  title, assets, isActive, busy, actionLabel, onUse, onDelete,
}: {
  title: string
  assets: Website3DAsset[]
  isActive: (a: Website3DAsset) => string | null
  busy: boolean
  actionLabel: string
  onUse: (a: Website3DAsset) => void
  onDelete: (a: Website3DAsset) => void
}) {
  if (assets.length === 0) return null
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ fontSize: '0.6875rem', color: '#71717a', marginBottom: '0.375rem' }}>{title}</div>
      {assets.map((a) => {
        const active = isActive(a)
        return (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem',
            padding: '0.5rem', borderRadius: '0.5rem',
            background: active ? '#14532d22' : '#18181b',
            border: `1px solid ${active ? '#22c55e55' : '#27272a'}`,
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.7rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {a.name}
              </div>
              {active && (
                <span style={{ fontSize: '0.6rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase' }}>
                  ● Active {active}
                </span>
              )}
            </div>
            <button disabled={busy} onClick={() => onUse(a)} style={{
              padding: '0.3rem 0.55rem', borderRadius: '0.375rem', border: '1px solid #c9a84c66',
              background: '#c9a84c22', color: '#e9d8a6', fontSize: '0.65rem', cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap',
            }}>{actionLabel}</button>
            <button disabled={busy} onClick={() => onDelete(a)} title="Delete" style={{
              padding: '0.3rem 0.45rem', borderRadius: '0.375rem', border: '1px solid #3f3f46',
              background: 'transparent', color: '#71717a', fontSize: '0.65rem', cursor: busy ? 'wait' : 'pointer',
            }}>✕</button>
          </div>
        )
      })}
    </div>
  )
}

function UploadButton({
  text, accept, busy, multiple, onFiles,
}: {
  text: string; accept: string; busy: boolean; multiple?: boolean; onFiles: (files: FileList) => void
}) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0.5rem', marginBottom: '0.5rem', borderRadius: '0.5rem',
      border: '1px dashed #3f3f46', background: '#18181b', color: '#a1a1aa',
      fontSize: '0.75rem', cursor: busy ? 'wait' : 'pointer',
    }}>
      {busy ? 'Uploading…' : text}
      <input type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files; if (f && f.length) onFiles(f); e.currentTarget.value = '' }} />
    </label>
  )
}

function RangeRow({
  label: lbl, min, max, step, value, onChange,
}: {
  label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void
}) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <label style={label}>{lbl}</label>
        <span style={{ fontSize: '0.6875rem', color: '#71717a' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#c9a84c' }} />
    </div>
  )
}

export default Premium3DHeroMediaPanel
