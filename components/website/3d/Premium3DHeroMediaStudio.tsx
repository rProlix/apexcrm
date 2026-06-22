'use client'

// components/website/3d/Premium3DHeroMediaStudio.tsx
//
// "Premium 3D Scroll Hero Media Studio" — the visible builder panel for the
// premium_3d_scroll_hero section's video_scrub mode. Upload (drag/drop, tabbed),
// browse a grouped media library, activate hero/poster/fallback, scrub & preview
// timelines, presets, validation, auto-poster, and diagnostics.
//
// It writes the ACTIVE media + settings into the real Website Builder DRAFT
// section content via the Zustand store (optimistic + autosaved → published on
// publish). NO Spline anywhere.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { Select, Toggle } from '@/components/builder/editors/FormFields'
import {
  uploadWebsite3DAsset,
  getWebsite3DAssetGroups,
  activateWebsite3DAsset,
  archiveWebsite3DAsset,
  updateWebsite3DAsset,
  recordWebsite3DAsset,
  type Website3DAsset,
  type Website3DAssetGroups,
} from '@/lib/builder/api'
import {
  normalizeScrollHeroContent,
  type Premium3DScrollHeroContent,
  type VideoScrubSettings,
} from '@/lib/website/premium3d/types'
import { SCRUB_PRESETS, buildScrubPresetPatch } from '@/lib/website/premium3d/scrubPresets'

interface Props { sectionId: string }

type Tab = 'video' | 'image_sequence' | 'poster' | 'fallback'

// ── Styles ────────────────────────────────────────────────────────────────────
const label: React.CSSProperties = { display: 'block', fontSize: '0.75rem', color: '#a1a1aa', marginBottom: '0.375rem' }
const group: React.CSSProperties = { marginBottom: '1rem' }
const head: React.CSSProperties = {
  margin: '1.25rem 0 0.75rem', fontSize: '0.6875rem', fontWeight: 700,
  color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em',
}
const card: React.CSSProperties = {
  border: '1px solid #27272a', borderRadius: '0.625rem', background: '#0e0e11', padding: '0.75rem', marginBottom: '0.75rem',
}

const VIDEO_MAX_MB = 75
const IMG_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']

function fmtBytes(n?: number | null): string {
  if (!n) return '—'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
function naturalSort(files: File[]): File[] {
  return [...files].sort((a, b) =>
    a.name.replace(/\d+/g, (m) => m.padStart(8, '0'))
      .localeCompare(b.name.replace(/\d+/g, (m) => m.padStart(8, '0'))))
}

export function Premium3DHeroMediaStudio({ sectionId }: Props) {
  const { sections, updateSectionContent, tenantId: ctxTenant, isPublished } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)
  const tenantId =
    ctxTenant ||
    ((section as Record<string, unknown> | undefined)?.tenant_id as string | undefined) ||
    ''

  const content: Premium3DScrollHeroContent = normalizeScrollHeroContent(section?.content)
  const scrub: VideoScrubSettings = content.videoScrub!

  const [groups, setGroups] = useState<Website3DAssetGroups>({ videos: [], imageSequences: [], posters: [], fallbacks: [], frames: [] })
  const [tab, setTab] = useState<Tab>(scrub.mode === 'image_sequence' ? 'image_sequence' : 'video')
  const [uploading, setUploading] = useState<{ kind: string; pct: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ level: 'ok' | 'error'; msg: string } | null>(null)
  const [showDiag, setShowDiag] = useState(false)

  const refresh = useCallback(() => {
    if (!tenantId) return
    void getWebsite3DAssetGroups(tenantId, {}).then(setGroups).catch(() => {})
  }, [tenantId])

  useEffect(() => { refresh() }, [refresh])

  const patch = useCallback((changes: Partial<Premium3DScrollHeroContent>) => {
    if (!section) return
    updateSectionContent(sectionId, { ...section.content, ...changes } as Record<string, unknown>)
  }, [section, sectionId, updateSectionContent])

  const patchScrub = useCallback((changes: Partial<VideoScrubSettings>) => {
    patch({ videoScrub: { ...scrub, ...changes } })
  }, [patch, scrub])

  // ── Single-file upload (video/poster/fallback) ──
  const doUpload = useCallback(async (
    file: File,
    assetType: string,
    apply?: (url: string, asset: Website3DAsset | null) => void,
  ) => {
    if (!tenantId) return
    setUploading({ kind: assetType, pct: 30 })
    setNotice(null)
    try {
      const res = await uploadWebsite3DAsset(file, tenantId, { assetType, sectionId, renderMode: 'video_scrub' })
      if (res?.url) {
        apply?.(res.url, res.asset)
        setNotice({ level: 'ok', msg: `Uploaded ${file.name}.` })
        refresh()
      } else {
        setNotice({ level: 'error', msg: 'Upload failed. Please try again.' })
      }
    } finally {
      setUploading(null)
    }
  }, [tenantId, sectionId, refresh])

  // ── Image-sequence frames → grouped under one sequence_id, with a parent row ──
  const uploadFrames = useCallback(async (files: FileList) => {
    if (!tenantId || files.length === 0) return
    setUploading({ kind: 'image_sequence_frame', pct: 5 })
    setNotice(null)
    try {
      const sequenceId =
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : `seq-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const sorted = naturalSort(Array.from(files))
      const urls: string[] = []
      let firstPath = ''
      for (let i = 0; i < sorted.length; i++) {
        setUploading({ kind: 'image_sequence_frame', pct: Math.round(((i + 1) / sorted.length) * 90) })
        const res = await uploadWebsite3DAsset(sorted[i], tenantId, {
          assetType: 'image_sequence_frame',
          sectionId,
          sequenceId,
          frameIndex: i,
          renderMode: 'video_scrub',
          sortOrder: i,
          metadata: { sequenceId, frameIndex: i, frameCount: sorted.length },
        })
        if (res?.url) urls.push(res.url)
        if (res?.asset?.storage_path && !firstPath) firstPath = res.asset.storage_path
      }
      if (urls.length > 0) {
        // Parent "image_sequence" group row so the sequence is selectable as a unit.
        await recordWebsite3DAsset(tenantId, {
          assetType: 'image_sequence',
          name: `Sequence (${urls.length} frames)`,
          publicUrl: urls[0],
          storagePath: firstPath || urls[0],
          sectionId,
          sequenceId,
          renderMode: 'video_scrub',
          frameCount: urls.length,
          fps: scrub.fps ?? 30,
          metadata: { sequenceId, frameCount: urls.length, fps: scrub.fps ?? 30, frameUrls: urls },
        })
        patch({
          renderMode: 'video_scrub',
          useImageSequence: true,
          imageSequenceUrls: urls,
          activeImageSequenceAssetId: sequenceId,
          activeAssetId: sequenceId,
          posterUrl: content.posterUrl || urls[0],
        })
        patchScrub({ mode: 'image_sequence', enabled: true, fps: scrub.fps ?? 30 })
        setNotice({ level: 'ok', msg: `Uploaded ${urls.length} frames as an image sequence.` })
        refresh()
      }
    } finally {
      setUploading(null)
    }
  }, [tenantId, sectionId, patch, patchScrub, refresh, scrub.fps, content.posterUrl])

  // ── Activation ──
  const activate = useCallback(async (asset: Website3DAsset, mode: Tab) => {
    setBusy(true); setNotice(null)
    try {
      const seqId = (asset.sequence_id ?? (asset.metadata?.sequenceId as string | undefined)) ?? null
      const res = await activateWebsite3DAsset(asset.id, mode, sectionId, { sequenceId: seqId })
      if (res?.contentPatch) {
        patch(res.contentPatch as Partial<Premium3DScrollHeroContent>)
        if (mode === 'video') patchScrub({ mode: 'video', enabled: true })
        if (mode === 'image_sequence') patchScrub({ mode: 'image_sequence', enabled: true })
        setNotice({ level: 'ok', msg: 'Set as active hero media. Publish the website to show it publicly.' })
        refresh()
      } else {
        setNotice({ level: 'error', msg: 'Could not activate this asset.' })
      }
    } finally { setBusy(false) }
  }, [sectionId, patch, patchScrub, refresh])

  const rename = useCallback(async (asset: Website3DAsset) => {
    const name = window.prompt('Rename asset', asset.name)
    if (!name || name === asset.name) return
    setBusy(true)
    try { await updateWebsite3DAsset(asset.id, { name }); refresh() } finally { setBusy(false) }
  }, [refresh])

  const remove = useCallback(async (asset: Website3DAsset) => {
    const isActive =
      asset.id === content.activeVideoAssetId ||
      asset.id === content.activeImageSequenceAssetId ||
      asset.id === content.posterAssetId ||
      asset.id === content.fallbackAssetId
    if (isActive && !window.confirm('This asset is active on the hero. Remove it anyway? You should pick another asset and re-publish.')) return
    setBusy(true)
    try { await archiveWebsite3DAsset(asset.id); refresh() } finally { setBusy(false) }
  }, [refresh, content])

  const copyUrl = useCallback((asset: Website3DAsset) => {
    if (asset.public_url) {
      void navigator.clipboard?.writeText(asset.public_url)
      setNotice({ level: 'ok', msg: 'URL copied to clipboard.' })
    }
  }, [])

  // ── Auto-poster: capture the active video's current frame via canvas ──
  const capturePoster = useCallback(async (videoEl: HTMLVideoElement | null) => {
    if (!videoEl || !tenantId) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = videoEl.videoWidth || 1280
      canvas.height = videoEl.videoHeight || 720
      const cx = canvas.getContext('2d')
      if (!cx) throw new Error('no canvas context')
      cx.drawImage(videoEl, 0, 0, canvas.width, canvas.height)
      const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85))
      if (!blob) throw new Error('capture failed')
      const file = new File([blob], `poster-${Date.now()}.jpg`, { type: 'image/jpeg' })
      await doUpload(file, 'poster', (url, asset) => patch({ posterUrl: url, posterAssetId: asset?.id ?? null }))
    } catch {
      setNotice({ level: 'error', msg: 'Could not auto-generate a poster (CORS/codec). Upload a poster image instead.' })
    }
  }, [tenantId, doUpload, patch])

  // ── Active detection + badges ──
  const activeKind = useCallback((a: Website3DAsset): Tab | null => {
    const seqId = (a.sequence_id ?? (a.metadata?.sequenceId as string | undefined)) ?? a.id
    if (a.id === content.activeVideoAssetId) return 'video'
    if (seqId === content.activeImageSequenceAssetId || a.id === content.activeImageSequenceAssetId) return 'image_sequence'
    if (a.id === content.posterAssetId || (a.public_url && a.public_url === content.posterUrl)) return 'poster'
    if (a.id === content.fallbackAssetId || (a.public_url && a.public_url === content.fallbackImageUrl)) return 'fallback'
    if (a.public_url && a.public_url === content.videoUrl) return 'video'
    return null
  }, [content])

  // ── Validation / warnings ──
  const warnings = useMemo(() => {
    const list: { level: 'error' | 'warn' | 'info'; msg: string }[] = []
    if (scrub.mode === 'video') {
      if (!content.videoUrl) list.push({ level: 'error', msg: 'Upload a video before enabling MP4 scrub.' })
      const v = groups.videos.find((x) => x.id === content.activeVideoAssetId)
      if (v?.mime_type && v.mime_type !== 'video/mp4') list.push({ level: 'warn', msg: 'Active video is not MP4 — H.264 MP4 is recommended for browser support.' })
      if (v?.file_size_bytes && v.file_size_bytes > VIDEO_MAX_MB * 1024 * 1024) list.push({ level: 'warn', msg: `Active video is large (${fmtBytes(v.file_size_bytes)}). Keep it short and optimized.` })
      if (v?.duration_seconds && v.duration_seconds > 30) list.push({ level: 'warn', msg: 'Active video is long (>30s). Shorter clips scrub better.' })
    } else {
      const n = content.imageSequenceUrls?.length ?? 0
      if (n < 8) list.push({ level: 'error', msg: 'Upload at least 8 image sequence frames before enabling image sequence scrub.' })
      else if (n < 40) list.push({ level: 'warn', msg: `${n} frames — 40–150 frames is ideal for smooth scrubbing.` })
      else if (n > 300) list.push({ level: 'warn', msg: `${n} frames may use a lot of bandwidth. 40–150 is ideal.` })
    }
    if (!content.posterUrl) list.push({ level: 'warn', msg: 'Poster image recommended (loading / mobile / reduced motion).' })
    if (!content.fallbackImageUrl) list.push({ level: 'warn', msg: 'Fallback image recommended.' })
    if (!isPublished) list.push({ level: 'info', msg: 'This media is saved in draft. Publish the website to show it publicly.' })
    return list
  }, [scrub.mode, content, groups.videos, isPublished])

  if (!section) return null

  const activeVideo = groups.videos.find((a) => activeKind(a) === 'video')
  const activeSeq = groups.imageSequences.find((a) => activeKind(a) === 'image_sequence')

  return (
    <div>
      <h4 style={head}>3D Hero Media Studio</h4>

      {/* Mode + enable */}
      <div style={group}>
        <Toggle label="Enable video / image scroll hero" value={!!scrub.enabled}
          onChange={(v) => patchScrub({ enabled: v })} />
      </div>
      <div style={group}>
        <label style={label}>Scrub mode</label>
        <Select
          value={scrub.mode}
          onChange={(v) => {
            const mode = v === 'image_sequence' ? 'image_sequence' : 'video'
            patchScrub({ mode }); patch({ renderMode: 'video_scrub', useImageSequence: mode === 'image_sequence' })
            setTab(mode)
          }}
          options={[
            { value: 'video', label: 'MP4 Video (H.264)' },
            { value: 'image_sequence', label: 'Image Sequence (frame-perfect)' },
          ]}
        />
      </div>

      {/* Validation banners */}
      <div style={group}>
        {warnings.map((e, i) => (
          <Banner key={i} level={e.level}>{e.msg}</Banner>
        ))}
      </div>

      {/* ── Tabbed drag/drop uploader ── */}
      <h4 style={head}>Upload media</h4>
      <Tabs tab={tab} setTab={setTab} />
      {tab === 'video' && (
        <Dropzone
          text="Drag & drop or browse — H.264 MP4"
          accept="video/mp4,.mp4"
          uploading={uploading?.kind === 'video' ? uploading.pct : null}
          validate={(f) => f.type === 'video/mp4' || f.name.toLowerCase().endsWith('.mp4') ? null : 'Must be an MP4 video.'}
          onFiles={(files) => doUpload(files[0], 'video', (url, asset) => {
            patch({ renderMode: 'video_scrub', useImageSequence: false, videoUrl: url, activeVideoAssetId: asset?.id ?? null, activeAssetId: asset?.id ?? null })
            patchScrub({ mode: 'video', enabled: true })
          })}
        />
      )}
      {tab === 'image_sequence' && (
        <Dropzone
          text="Drag & drop or browse — multiple WebP/JPG/PNG frames"
          accept="image/webp,image/jpeg,image/png,image/avif"
          multiple
          uploading={uploading?.kind === 'image_sequence_frame' ? uploading.pct : null}
          validate={(f) => IMG_OK.includes(f.type) ? null : 'Frames must be WebP/JPG/PNG/AVIF.'}
          onFiles={(files) => uploadFrames(files)}
        />
      )}
      {tab === 'poster' && (
        <Dropzone
          text="Drag & drop or browse — poster image"
          accept="image/*"
          uploading={uploading?.kind === 'poster' ? uploading.pct : null}
          onFiles={(files) => doUpload(files[0], 'poster', (url, asset) => patch({ posterUrl: url, posterAssetId: asset?.id ?? null }))}
        />
      )}
      {tab === 'fallback' && (
        <Dropzone
          text="Drag & drop or browse — fallback image"
          accept="image/*"
          uploading={uploading?.kind === 'fallback' ? uploading.pct : null}
          onFiles={(files) => doUpload(files[0], 'fallback', (url, asset) => patch({ fallbackImageUrl: url, fallbackAssetId: asset?.id ?? null }))}
        />
      )}

      {notice && (
        <Banner level={notice.level === 'ok' ? 'info' : 'error'}>{notice.msg}</Banner>
      )}

      {/* ── Preview timelines ── */}
      {scrub.mode === 'video' && content.videoUrl && (
        <>
          <h4 style={head}>Video preview timeline</h4>
          <VideoPreviewTimeline
            videoUrl={content.videoUrl}
            posterUrl={content.posterUrl ?? undefined}
            objectFit={scrub.objectFit}
            onCapturePoster={capturePoster}
          />
        </>
      )}
      {scrub.mode === 'image_sequence' && (content.imageSequenceUrls?.length ?? 0) > 1 && (
        <>
          <h4 style={head}>Image sequence preview timeline</h4>
          <FramePreviewTimeline
            frames={content.imageSequenceUrls ?? []}
            objectFit={scrub.objectFit}
            onSetPoster={(url) => patch({ posterUrl: url })}
            onSetFallback={(url) => patch({ fallbackImageUrl: url })}
          />
        </>
      )}

      {/* ── Media library ── */}
      <h4 style={head}>Media library</h4>
      <LibrarySection title="Active hero video" assets={activeVideo ? [activeVideo] : []} activeKind={activeKind} busy={busy} actionLabel="Use as 3D Hero" onUse={(a) => activate(a, 'video')} onRename={rename} onRemove={remove} onCopy={copyUrl} />
      <LibrarySection title="Available videos" assets={groups.videos.filter((a) => activeKind(a) !== 'video')} activeKind={activeKind} busy={busy} actionLabel="Use this video" onUse={(a) => activate(a, 'video')} onRename={rename} onRemove={remove} onCopy={copyUrl} />
      <LibrarySection title="Active image sequence" assets={activeSeq ? [activeSeq] : []} activeKind={activeKind} busy={busy} actionLabel="Use as 3D Hero" onUse={(a) => activate(a, 'image_sequence')} onRename={rename} onRemove={remove} onCopy={copyUrl} />
      <LibrarySection title="Available image sequences" assets={groups.imageSequences.filter((a) => activeKind(a) !== 'image_sequence')} activeKind={activeKind} busy={busy} actionLabel="Use this image sequence" onUse={(a) => activate(a, 'image_sequence')} onRename={rename} onRemove={remove} onCopy={copyUrl} />
      <LibrarySection title="Poster images" assets={groups.posters} activeKind={activeKind} busy={busy} actionLabel="Use as Poster" onUse={(a) => activate(a, 'poster')} onRename={rename} onRemove={remove} onCopy={copyUrl} />
      <LibrarySection title="Fallback images" assets={groups.fallbacks} activeKind={activeKind} busy={busy} actionLabel="Use as Fallback" onUse={(a) => activate(a, 'fallback')} onRename={rename} onRemove={remove} onCopy={copyUrl} />
      {groups.videos.length + groups.imageSequences.length + groups.posters.length + groups.fallbacks.length === 0 && (
        <p style={{ fontSize: '0.7rem', color: '#71717a', marginBottom: '1rem' }}>No media uploaded for this hero yet.</p>
      )}

      {/* ── Presets ── */}
      <h4 style={head}>Scrub presets</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.375rem', marginBottom: '1rem' }}>
        {SCRUB_PRESETS.map((p) => (
          <button key={p.key} title={p.description} disabled={busy}
            onClick={() => { patch(buildScrubPresetPatch(p.key, content)); setTab(p.mode); setNotice({ level: 'ok', msg: `Applied "${p.label}" preset (your media is preserved).` }) }}
            style={{
              textAlign: 'left', padding: '0.5rem 0.625rem', borderRadius: '0.5rem',
              border: content.presetKey === p.key ? '1px solid #c9a84c' : '1px solid #27272a',
              background: content.presetKey === p.key ? '#c9a84c1a' : '#18181b',
              color: '#e4e4e7', fontSize: '0.7rem', cursor: busy ? 'wait' : 'pointer',
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Scrub settings ── */}
      <h4 style={head}>Scrub settings</h4>
      <div style={group}>
        <Toggle label="Enable scroll scrub" value={!!scrub.enabled} onChange={(v) => patchScrub({ enabled: v })} />
      </div>
      <div style={group}>
        <Toggle label="Pin hero while scrolling" value={scrub.pinOnScroll}
          onChange={(v) => { patchScrub({ pinOnScroll: v }); patch({ pinOnScroll: v }) }} />
      </div>
      <Range label="Scroll length (× viewport height)" min={1} max={6} step={0.5}
        value={content.scrollLength ?? 2.5} onChange={(v) => { patch({ scrollLength: v }); patchScrub({ scrollLength: v }) }} />
      <Range label="Scrub smoothing" min={0} max={1} step={0.02}
        value={content.scrubSmoothing ?? 0.12} onChange={(v) => { patch({ scrubSmoothing: v }); patchScrub({ scrubSmoothing: v }) }} />
      <div style={group}>
        <label style={label}>Object fit</label>
        <Select value={scrub.objectFit}
          onChange={(v) => { patchScrub({ objectFit: v as 'cover' | 'contain' }); patch({ videoObjectFit: v as 'cover' | 'contain' }) }}
          options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }]} />
      </div>
      <Range label="Overlay opacity" min={0} max={1} step={0.05}
        value={content.overlayOpacity ?? 0.35} onChange={(v) => { patch({ overlayOpacity: v }); patchScrub({ overlayOpacity: v }) }} />
      <Range label="Background gradient strength" min={0} max={1} step={0.05}
        value={content.backgroundGradientStrength ?? 0.45} onChange={(v) => { patch({ backgroundGradientStrength: v }); patchScrub({ backgroundGradientStrength: v }) }} />
      <div style={group}>
        <label style={label}>Hero height</label>
        <Select value={content.heroHeight ?? '100vh'}
          onChange={(v) => { patch({ heroHeight: v as Premium3DScrollHeroContent['heroHeight'] }); patchScrub({ heroHeight: v as VideoScrubSettings['heroHeight'] }) }}
          options={[
            { value: '100vh', label: '100vh' }, { value: '120vh', label: '120vh' },
            { value: '150vh', label: '150vh' }, { value: 'custom', label: 'Custom' },
          ]} />
      </div>
      {content.heroHeight === 'custom' && (
        <div style={group}>
          <label style={label}>Custom hero height (CSS, e.g. 90vh or 800px)</label>
          <input style={inputBox} value={content.customHeroHeight ?? ''}
            onChange={(e) => { patch({ customHeroHeight: e.target.value }); patchScrub({ customHeroHeight: e.target.value }) }} />
        </div>
      )}
      <div style={group}>
        <label style={label}>Content alignment</label>
        <Select value={content.contentAlignment ?? 'left'}
          onChange={(v) => { patch({ contentAlignment: v as Premium3DScrollHeroContent['contentAlignment'] }); patchScrub({ contentAlignment: v as VideoScrubSettings['contentAlignment'] }) }}
          options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]} />
      </div>
      <div style={group}>
        <label style={label}>Text reveal timing</label>
        <Select value={content.textRevealTiming ?? 'middle'}
          onChange={(v) => { patch({ textRevealTiming: v as Premium3DScrollHeroContent['textRevealTiming'] }); patchScrub({ textRevealTiming: v as VideoScrubSettings['textRevealTiming'] }) }}
          options={[{ value: 'early', label: 'Early' }, { value: 'middle', label: 'Middle' }, { value: 'late', label: 'Late' }]} />
      </div>

      {scrub.mode === 'video' && (
        <>
          <div style={group}>
            <label style={label}>Preload</label>
            <Select value={scrub.preload}
              onChange={(v) => patchScrub({ preload: v as 'metadata' | 'auto' | 'none' })}
              options={[
                { value: 'metadata', label: 'metadata (recommended)' },
                { value: 'auto', label: 'auto' }, { value: 'none', label: 'none' },
              ]} />
          </div>
          <Range label="Start time (s, 0 = beginning)" min={0} max={60} step={0.5}
            value={scrub.startTime ?? 0} onChange={(v) => patchScrub({ startTime: v || null })} />
          <Range label="End time (s, 0 = full duration)" min={0} max={120} step={0.5}
            value={scrub.endTime ?? 0} onChange={(v) => patchScrub({ endTime: v || null })} />
        </>
      )}
      {scrub.mode === 'image_sequence' && (
        <>
          <Range label="FPS (image sequence metadata)" min={12} max={60} step={1}
            value={scrub.fps ?? 30} onChange={(v) => patchScrub({ fps: v })} />
          <div style={group}>
            <label style={label}>Frame order</label>
            <Select value={scrub.frameOrder ?? 'filename'}
              onChange={(v) => patchScrub({ frameOrder: v as VideoScrubSettings['frameOrder'] })}
              options={[
                { value: 'filename', label: 'Filename order (natural)' },
                { value: 'upload', label: 'Upload order' },
                { value: 'manual', label: 'Manual order' },
              ]} />
          </div>
          <div style={group}>
            <label style={label}>Frame preload strategy</label>
            <Select value={scrub.preloadStrategy ?? 'nearby'}
              onChange={(v) => patchScrub({ preloadStrategy: v as VideoScrubSettings['preloadStrategy'] })}
              options={[
                { value: 'nearby', label: 'Nearby frames only (recommended)' },
                { value: 'first20', label: 'First 20 frames' },
                { value: 'all', label: 'All frames (if under safe limit)' },
              ]} />
          </div>
        </>
      )}
      <div style={group}>
        <label style={label}>Mobile behavior</label>
        <Select value={scrub.mobileFallbackMode}
          onChange={(v) => { patchScrub({ mobileFallbackMode: v as VideoScrubSettings['mobileFallbackMode'] }); patch({ mobileFallbackMode: v as Premium3DScrollHeroContent['mobileFallbackMode'] }) }}
          options={[
            { value: 'poster', label: 'Poster (lightest)' },
            { value: 'static', label: 'Static fallback image' },
            { value: 'reduced_video', label: 'Reduced video' },
            { value: 'full_scrub', label: 'Full scrub on mobile' },
            { value: 'image_sequence', label: 'Image sequence' },
          ]} />
      </div>
      <div style={group}>
        <label style={label}>Reduced motion behavior</label>
        <Select value={scrub.reducedMotionFallback}
          onChange={(v) => { patchScrub({ reducedMotionFallback: v as VideoScrubSettings['reducedMotionFallback'] }); patch({ reducedMotionFallback: v as Premium3DScrollHeroContent['reducedMotionFallback'] }) }}
          options={[
            { value: 'poster', label: 'Poster image' },
            { value: 'static', label: 'Static fallback image' },
          ]} />
      </div>

      {/* ── Recommended specs + FFmpeg helper ── */}
      <h4 style={head}>Recommended specs</h4>
      {scrub.mode === 'video' ? (
        <ul style={helpList}>
          <li>Use MP4 H.264 for best browser support.</li>
          <li>Video does not autoplay normally — it scrubs based on scroll.</li>
          <li>Keep videos short and optimized; 1080p max recommended, muted (no audio).</li>
          <li>Add a poster image for loading / mobile / reduced motion.</li>
          <li>For perfect frame control, use image sequence mode.</li>
        </ul>
      ) : (
        <ul style={helpList}>
          <li>Use WebP or JPG frames.</li>
          <li>40–150 frames is ideal for most hero sections.</li>
          <li>Name frames like frame_0001.webp, frame_0002.webp.</li>
          <li>Image sequence gives smoother frame-perfect scroll but can use more bandwidth.</li>
          <li>Mobile visitors may receive a poster or lighter fallback.</li>
        </ul>
      )}
      <div style={{ ...card, fontSize: '0.65rem', color: '#a1a1aa', lineHeight: 1.6 }}>
        <div style={{ color: '#c9a84c', marginBottom: '0.25rem' }}>Convert a video to an image sequence (FFmpeg):</div>
        <code style={{ display: 'block', whiteSpace: 'pre-wrap', color: '#e4e4e7' }}>
          ffmpeg -i input.mp4 -vf fps=30,scale=1920:-1 frame_%04d.webp
        </code>
      </div>

      {/* ── Diagnostics ── */}
      <button onClick={() => setShowDiag((s) => !s)} style={{
        width: '100%', marginTop: '0.5rem', padding: '0.5rem', borderRadius: '0.5rem',
        border: '1px solid #27272a', background: '#18181b', color: '#a1a1aa', fontSize: '0.7rem', cursor: 'pointer',
      }}>
        {showDiag ? '▲ Hide' : '▼ Show'} 3D Hero Diagnostics
      </button>
      {showDiag && (
        <div style={{ ...card, marginTop: '0.5rem', fontFamily: 'monospace', fontSize: '0.65rem', color: '#a1a1aa', lineHeight: 1.7 }}>
          <Diag k="section id" v={sectionId} />
          <Diag k="renderMode" v={content.renderMode} />
          <Diag k="videoScrub.mode" v={scrub.mode} />
          <Diag k="active video id" v={content.activeVideoAssetId ?? '—'} />
          <Diag k="active sequence id" v={content.activeImageSequenceAssetId ?? '—'} />
          <Diag k="poster id" v={content.posterAssetId ?? '—'} />
          <Diag k="fallback id" v={content.fallbackAssetId ?? '—'} />
          <Diag k="video URL" v={content.videoUrl ? 'present' : 'missing'} />
          <Diag k="poster URL" v={content.posterUrl ? 'present' : 'missing'} />
          <Diag k="fallback URL" v={content.fallbackImageUrl ? 'present' : 'missing'} />
          <Diag k="frame count" v={String(content.imageSequenceUrls?.length ?? 0)} />
          <Diag k="publish status" v={isPublished ? 'published' : 'publish required'} />
          <Diag k="reduced motion" v={scrub.reducedMotionFallback} />
          <Diag k="mobile fallback" v={scrub.mobileFallbackMode} />
          {warnings.filter((w) => w.level !== 'info').map((w, i) => (
            <div key={i} style={{ color: w.level === 'error' ? '#fca5a5' : '#fcd34d' }}>! {w.msg}</div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

const inputBox: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', background: '#18181b', border: '1px solid #3f3f46',
  borderRadius: '0.5rem', color: '#f4f4f5', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
}
const helpList: React.CSSProperties = { margin: '0 0 1rem', padding: '0 0 0 1rem', fontSize: '0.6875rem', color: '#71717a', lineHeight: 1.6 }

function Banner({ level, children }: { level: 'error' | 'warn' | 'info'; children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '0.7rem', lineHeight: 1.4, marginBottom: '0.375rem', padding: '0.5rem 0.625rem', borderRadius: '0.5rem',
      background: level === 'error' ? '#7f1d1d33' : level === 'warn' ? '#78350f33' : '#1e3a8a33',
      border: `1px solid ${level === 'error' ? '#ef444455' : level === 'warn' ? '#f59e0b55' : '#3b82f655'}`,
      color: level === 'error' ? '#fca5a5' : level === 'warn' ? '#fcd34d' : '#93c5fd',
    }}>{children}</div>
  )
}

function Diag({ k, v }: { k: string; v: string }) {
  return <div><span style={{ color: '#52525b' }}>{k}:</span> <span style={{ color: '#d4d4d8' }}>{v}</span></div>
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string }[] = [
    { id: 'video', label: 'Video' }, { id: 'image_sequence', label: 'Image Sequence' },
    { id: 'poster', label: 'Poster' }, { id: 'fallback', label: 'Fallback' },
  ]
  return (
    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.625rem', flexWrap: 'wrap' }}>
      {items.map((it) => (
        <button key={it.id} onClick={() => setTab(it.id)} style={{
          flex: 1, padding: '0.4rem 0.3rem', borderRadius: '0.4rem', fontSize: '0.68rem', cursor: 'pointer', whiteSpace: 'nowrap',
          border: tab === it.id ? '1px solid #c9a84c' : '1px solid #27272a',
          background: tab === it.id ? '#c9a84c1a' : '#18181b',
          color: tab === it.id ? '#e9d8a6' : '#a1a1aa', fontWeight: tab === it.id ? 700 : 500,
        }}>{it.label}</button>
      ))}
    </div>
  )
}

function Dropzone({
  text, accept, multiple, uploading, validate, onFiles,
}: {
  text: string; accept: string; multiple?: boolean; uploading: number | null
  validate?: (f: File) => string | null; onFiles: (files: FileList) => void
}) {
  const [over, setOver] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (validate) {
      for (const f of Array.from(files)) { const v = validate(f); if (v) { setErr(v); return } }
    }
    setErr(null); onFiles(files)
  }

  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); handle(e.dataTransfer.files) }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem',
          padding: '1.25rem 0.75rem', borderRadius: '0.625rem', cursor: uploading != null ? 'wait' : 'pointer',
          border: `1.5px dashed ${over ? '#c9a84c' : '#3f3f46'}`, background: over ? '#c9a84c14' : '#101013',
          color: '#a1a1aa', fontSize: '0.75rem', textAlign: 'center',
        }}
      >
        {uploading != null ? (
          <>
            <span>Uploading… {uploading}%</span>
            <div style={{ width: '80%', height: 5, borderRadius: 99, background: '#27272a', overflow: 'hidden' }}>
              <div style={{ width: `${uploading}%`, height: '100%', background: '#c9a84c', transition: 'width 0.2s' }} />
            </div>
          </>
        ) : (
          <>
            <span style={{ fontSize: '1.1rem' }}>⬆</span>
            <span>{text}</span>
          </>
        )}
        <input ref={inputRef} type="file" accept={accept} multiple={multiple} style={{ display: 'none' }}
          onChange={(e) => { handle(e.target.files); e.currentTarget.value = '' }} />
      </div>
      {err && <Banner level="error">{err}</Banner>}
    </div>
  )
}

function LibrarySection({
  title, assets, activeKind, busy, actionLabel, onUse, onRename, onRemove, onCopy,
}: {
  title: string; assets: Website3DAsset[]; activeKind: (a: Website3DAsset) => Tab | null; busy: boolean
  actionLabel: string; onUse: (a: Website3DAsset) => void; onRename: (a: Website3DAsset) => void
  onRemove: (a: Website3DAsset) => void; onCopy: (a: Website3DAsset) => void
}) {
  if (assets.length === 0) return null
  const badgeText: Record<Tab, string> = {
    video: 'Active Hero Video', image_sequence: 'Active Hero Image Sequence', poster: 'Active Poster', fallback: 'Active Fallback',
  }
  return (
    <div style={{ marginBottom: '0.875rem' }}>
      <div style={{ fontSize: '0.6875rem', color: '#71717a', marginBottom: '0.375rem' }}>{title}</div>
      {assets.map((a) => {
        const kind = activeKind(a)
        const isImg = a.asset_type === 'poster' || a.asset_type === 'fallback' || a.asset_type === 'image_sequence'
        return (
          <div key={a.id} style={{
            ...card, marginBottom: '0.5rem', padding: '0.5rem',
            border: kind ? '1px solid #22c55e66' : '1px solid #27272a',
            background: kind ? '#14532d1a' : '#0e0e11',
            display: 'flex', gap: '0.5rem', alignItems: 'flex-start',
          }}>
            <div style={{ width: 52, height: 52, borderRadius: '0.4rem', overflow: 'hidden', background: '#000', flexShrink: 0 }}>
              {isImg && a.public_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.public_url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : a.asset_type === 'video' && a.public_url ? (
                <video src={a.public_url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b', fontSize: '1rem' }}>🎞</div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.72rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
              <div style={{ fontSize: '0.6rem', color: '#71717a' }}>
                {a.asset_type} · {fmtBytes(a.file_size_bytes)}
                {a.width && a.height ? ` · ${a.width}×${a.height}` : ''}
                {a.duration_seconds ? ` · ${a.duration_seconds.toFixed(1)}s` : ''}
                {a.frame_count ? ` · ${a.frame_count} frames` : ''}
              </div>
              {kind && (
                <span style={{ display: 'inline-block', marginTop: '0.2rem', fontSize: '0.56rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  ● {badgeText[kind]}
                </span>
              )}
              <div style={{ display: 'flex', gap: '0.25rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
                <MiniBtn primary disabled={busy} onClick={() => onUse(a)}>{actionLabel}</MiniBtn>
                <MiniBtn disabled={busy} onClick={() => onRename(a)}>Rename</MiniBtn>
                <MiniBtn disabled={busy} onClick={() => onCopy(a)}>Copy URL</MiniBtn>
                {a.public_url && <a href={a.public_url} target="_blank" rel="noreferrer" style={miniBtnStyle(false)}>Open</a>}
                <MiniBtn disabled={busy} onClick={() => onRemove(a)}>Remove</MiniBtn>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function miniBtnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: '0.25rem 0.45rem', borderRadius: '0.35rem', fontSize: '0.62rem', cursor: 'pointer', textDecoration: 'none',
    border: primary ? '1px solid #c9a84c66' : '1px solid #3f3f46',
    background: primary ? '#c9a84c22' : 'transparent',
    color: primary ? '#e9d8a6' : '#a1a1aa', whiteSpace: 'nowrap',
  }
}
function MiniBtn({ primary, disabled, onClick, children }: { primary?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button disabled={disabled} onClick={onClick} style={{ ...miniBtnStyle(!!primary), opacity: disabled ? 0.6 : 1 }}>{children}</button>
}

function VideoPreviewTimeline({
  videoUrl, posterUrl, objectFit, onCapturePoster,
}: {
  videoUrl: string; posterUrl?: string; objectFit: 'cover' | 'contain'
  onCapturePoster: (el: HTMLVideoElement | null) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const [pct, setPct] = useState(0)
  const [dur, setDur] = useState(0)
  const [cur, setCur] = useState(0)
  const testRef = useRef<number | null>(null)

  useEffect(() => () => { if (testRef.current) cancelAnimationFrame(testRef.current) }, [])

  const seek = (p: number) => {
    setPct(p)
    const v = ref.current
    if (v && dur > 0) { v.currentTime = (p / 100) * dur; setCur(v.currentTime) }
  }
  const testScrub = () => {
    if (testRef.current) cancelAnimationFrame(testRef.current)
    const start = performance.now(); const ms = 2500
    const loop = (t: number) => {
      const p = Math.min(100, ((t - start) / ms) * 100)
      seek(p)
      if (p < 100) testRef.current = requestAnimationFrame(loop)
    }
    testRef.current = requestAnimationFrame(loop)
  }

  return (
    <div style={card}>
      <div style={{ aspectRatio: '16/9', background: '#000', borderRadius: '0.4rem', overflow: 'hidden', marginBottom: '0.5rem' }}>
        <video ref={ref} src={videoUrl} poster={posterUrl} muted playsInline preload="metadata"
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
          style={{ width: '100%', height: '100%', objectFit }} />
      </div>
      <input type="range" min={0} max={100} step={0.5} value={pct} onChange={(e) => seek(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#c9a84c' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#71717a', marginBottom: '0.4rem' }}>
        <span>{cur.toFixed(2)}s</span><span>{dur.toFixed(2)}s</span>
      </div>
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        <MiniBtn primary onClick={testScrub}>Test Scroll Scrub</MiniBtn>
        <MiniBtn onClick={() => seek(0)}>Reset to Start</MiniBtn>
        <MiniBtn onClick={() => onCapturePoster(ref.current)}>Set current frame as poster</MiniBtn>
      </div>
    </div>
  )
}

function FramePreviewTimeline({
  frames, objectFit, onSetPoster, onSetFallback,
}: {
  frames: string[]; objectFit: 'cover' | 'contain'
  onSetPoster: (url: string) => void; onSetFallback: (url: string) => void
}) {
  const [idx, setIdx] = useState(0)
  const testRef = useRef<number | null>(null)
  const total = frames.length
  useEffect(() => () => { if (testRef.current) cancelAnimationFrame(testRef.current) }, [])

  const testScrub = () => {
    if (testRef.current) cancelAnimationFrame(testRef.current)
    const start = performance.now(); const ms = 2500
    const loop = (t: number) => {
      const p = Math.min(1, (t - start) / ms)
      setIdx(Math.round(p * (total - 1)))
      if (p < 1) testRef.current = requestAnimationFrame(loop)
    }
    testRef.current = requestAnimationFrame(loop)
  }

  return (
    <div style={card}>
      <div style={{ aspectRatio: '16/9', background: '#000', borderRadius: '0.4rem', overflow: 'hidden', marginBottom: '0.5rem' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={frames[idx]} alt={`Frame ${idx + 1}`} style={{ width: '100%', height: '100%', objectFit }} />
      </div>
      <input type="range" min={0} max={total - 1} step={1} value={idx} onChange={(e) => setIdx(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#c9a84c' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.65rem', color: '#71717a', marginBottom: '0.4rem' }}>
        <span>Frame {idx + 1}</span><span>{total} frames</span>
      </div>
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        <MiniBtn onClick={() => setIdx((i) => Math.max(0, i - 1))}>◀ Prev</MiniBtn>
        <MiniBtn onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}>Next ▶</MiniBtn>
        <MiniBtn primary onClick={testScrub}>Test Scroll Scrub</MiniBtn>
        <MiniBtn onClick={() => onSetPoster(frames[idx])}>Set frame as poster</MiniBtn>
        <MiniBtn onClick={() => onSetFallback(frames[total - 1])}>Last frame as fallback</MiniBtn>
      </div>
    </div>
  )
}

function Range({
  label: lbl, min, max, step, value, onChange,
}: { label: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <label style={label}>{lbl}</label>
        <span style={{ fontSize: '0.6875rem', color: '#71717a' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} style={{ width: '100%', accentColor: '#c9a84c' }} />
    </div>
  )
}

export default Premium3DHeroMediaStudio
