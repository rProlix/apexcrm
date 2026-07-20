'use client'

// components/website/3d/Premium3DHeroUploadPanel.tsx
//
// ALWAYS-VISIBLE "3D Hero Uploads" panel for the premium_3d_scroll_hero
// section. Unlike the tabbed Media Studio, every upload input renders
// immediately and unconditionally the moment the section is selected — no
// tabs to discover, no render-mode gate. This is the panel the user sees
// inside the real Website Builder section settings sidebar (EditorSidebar).
//
// Behaviour:
//  - File inputs for MP4 video, image-sequence frames, poster, fallback are
//    visible immediately, even before any media exists.
//  - Selecting a file updates the builder DRAFT section config INSTANTLY using
//    a temporary object URL so the live preview works before the upload
//    finishes; the permanent Supabase URL replaces it when the upload returns.
//  - "Use as hero" buttons re-point the active media from the uploaded library.
//  - Scrub settings + live diagnostics are inline.
//
// All writes go through the real Zustand builder store (optimistic + autosaved,
// then published on Publish). NO Spline — only video / image-sequence scrub.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useBuilderStore } from '@/lib/builder/store'
import { Select } from '@/components/builder/editors/FormFields'
import {
  uploadWebsite3DAsset,
  getWebsite3DAssetGroups,
  recordWebsite3DAsset,
  type Website3DAsset,
  type Website3DAssetGroups,
} from '@/lib/builder/api'
import {
  normalizeScrollHeroContent,
  type Premium3DScrollHeroContent,
  type VideoScrubSettings,
} from '@/lib/website/premium3d/types'

interface Props {
  sectionId: string
}

// ── Styles ──────────────────────────────────────────────────────────────────
const wrap: React.CSSProperties = {
  border: '1px solid #c9a84c55',
  borderRadius: '0.75rem',
  background: '#0e0d0a',
  padding: '1rem',
  marginBottom: '1rem',
}
const title: React.CSSProperties = {
  margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 800, color: '#e9d8a6',
  display: 'flex', alignItems: 'center', gap: '0.5rem',
}
const sub: React.CSSProperties = { margin: '0 0 0.875rem', fontSize: '0.72rem', color: '#8a8a93', lineHeight: 1.4 }
const head: React.CSSProperties = {
  margin: '1.1rem 0 0.6rem', fontSize: '0.7rem', fontWeight: 700,
  color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.06em',
}
const label: React.CSSProperties = { display: 'block', fontSize: '0.72rem', color: '#a1a1aa', marginBottom: '0.35rem' }
const group: React.CSSProperties = { marginBottom: '0.875rem' }
const card: React.CSSProperties = {
  border: '1px solid #27272a', borderRadius: '0.6rem', background: '#141416', padding: '0.75rem', marginBottom: '0.75rem',
}
const fileInputStyle: React.CSSProperties = {
  width: '100%', fontSize: '0.72rem', color: '#d4d4d8',
  background: '#18181b', border: '1px dashed #3f3f46', borderRadius: '0.5rem',
  padding: '0.5rem', boxSizing: 'border-box', cursor: 'pointer',
}
const numInput: React.CSSProperties = {
  width: '100%', padding: '0.45rem 0.6rem', background: '#18181b', border: '1px solid #3f3f46',
  borderRadius: '0.5rem', color: '#f4f4f5', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
}

function naturalSort(files: File[]): File[] {
  return [...files].sort((a, b) =>
    a.name.replace(/\d+/g, (m) => m.padStart(8, '0'))
      .localeCompare(b.name.replace(/\d+/g, (m) => m.padStart(8, '0'))))
}

function newSequenceId(): string {
  return (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID()
    : `seq-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function Premium3DHeroUploadPanel({ sectionId }: Props) {
  const { sections, tenantId, isPublished, saveStatus } = useBuilderStore()
  const section = sections.find((s) => s.id === sectionId)

  // Live, reactive content (re-derives each render from store state)
  const content: Premium3DScrollHeroContent = normalizeScrollHeroContent(section?.content)
  const scrub: VideoScrubSettings = content.videoScrub!

  const [groups, setGroups] = useState<Website3DAssetGroups>({ videos: [], imageSequences: [], posters: [], fallbacks: [], frames: [] })
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; msg: string } | null>(null)
  // Transient local file names / counts (mirrors what we write into config too)
  const [localVideoName, setLocalVideoName] = useState<string | null>(null)
  const [localSeqCount, setLocalSeqCount] = useState<number | null>(null)
  const tmpUrls = useRef<string[]>([])

  // ── Fresh-state patch helpers (avoid stale-closure overwrite across awaits) ──
  const patch = useCallback((changes: Record<string, unknown>) => {
    const st = useBuilderStore.getState()
    const sec = st.sections.find((s) => s.id === sectionId)
    if (!sec) return
    st.updateSectionContent(sectionId, { ...(sec.content as Record<string, unknown>), ...changes })
  }, [sectionId])

  const patchScrub = useCallback((changes: Partial<VideoScrubSettings>) => {
    const st = useBuilderStore.getState()
    const sec = st.sections.find((s) => s.id === sectionId)
    const cur = normalizeScrollHeroContent(sec?.content).videoScrub!
    patch({ videoScrub: { ...cur, ...changes } })
  }, [sectionId, patch])

  const refresh = useCallback(() => {
    if (!tenantId) return
    void getWebsite3DAssetGroups(tenantId, { sectionId }).then(setGroups).catch(() => {})
  }, [tenantId, sectionId])

  useEffect(() => { refresh() }, [refresh])
  // Revoke any temporary object URLs on unmount
  useEffect(() => () => { tmpUrls.current.forEach((u) => { try { URL.revokeObjectURL(u) } catch {} }) }, [])

  const trackTmp = (u: string) => { tmpUrls.current.push(u); return u }

  // ── 1. Video ────────────────────────────────────────────────────────────────
  const onVideoFile = useCallback(async (file: File) => {
    const tmp = trackTmp(URL.createObjectURL(file))
    setLocalVideoName(file.name)
    // Instant local preview
    patch({
      renderMode: 'video_scrub',
      useImageSequence: false,
      videoUrl: tmp,
      localVideoFileName: file.name,
    })
    patchScrub({ enabled: true, mode: 'video' })

    if (!tenantId) { setNote({ ok: false, msg: 'No tenant context — preview only, cannot upload.' }); return }
    setBusy('video'); setNote(null)
    try {
      const res = await uploadWebsite3DAsset(file, tenantId, { assetType: 'video', sectionId, renderMode: 'video_scrub' })
      if (res?.url) {
        patch({ videoUrl: res.url, activeVideoAssetId: res.asset?.id ?? null, activeAssetId: res.asset?.id ?? null })
        setNote({ ok: true, msg: `Uploaded ${file.name}. Publish the website to show it publicly.` })
        refresh()
      } else {
        setNote({ ok: false, msg: 'Upload failed — local preview kept. Try again.' })
      }
    } finally { setBusy(null) }
  }, [tenantId, sectionId, patch, patchScrub, refresh])

  // ── 2. Image sequence ─────────────────────────────────────────────────────
  const onSequenceFiles = useCallback(async (files: FileList) => {
    if (files.length === 0) return
    const sorted = naturalSort(Array.from(files))
    const tmps = sorted.map((f) => trackTmp(URL.createObjectURL(f)))
    setLocalSeqCount(sorted.length)
    // Instant local preview
    patch({
      renderMode: 'video_scrub',
      useImageSequence: true,
      imageSequenceUrls: tmps,
      localImageSequenceFrameCount: sorted.length,
    })
    patchScrub({ enabled: true, mode: 'image_sequence', fps: scrub.fps ?? 30 })

    if (!tenantId) { setNote({ ok: false, msg: 'No tenant context — preview only, cannot upload.' }); return }
    setBusy('image_sequence'); setNote(null)
    try {
      const sequenceId = newSequenceId()
      const urls: string[] = []
      let firstPath = ''
      for (let i = 0; i < sorted.length; i++) {
        setBusy(`image_sequence:${i + 1}/${sorted.length}`)
        const res = await uploadWebsite3DAsset(sorted[i], tenantId, {
          assetType: 'image_sequence_frame', sectionId, sequenceId, frameIndex: i,
          renderMode: 'video_scrub', sortOrder: i,
          metadata: { sequenceId, frameIndex: i, frameCount: sorted.length },
        })
        if (res?.url) urls.push(res.url)
        if (res?.asset?.storage_path && !firstPath) firstPath = res.asset.storage_path
      }
      if (urls.length > 0) {
        await recordWebsite3DAsset(tenantId, {
          assetType: 'image_sequence', name: `Sequence (${urls.length} frames)`,
          publicUrl: urls[0], storagePath: firstPath || urls[0], sectionId, sequenceId,
          renderMode: 'video_scrub', frameCount: urls.length, fps: scrub.fps ?? 30,
          metadata: { sequenceId, frameCount: urls.length, fps: scrub.fps ?? 30, frameUrls: urls },
        })
        patch({
          imageSequenceUrls: urls,
          activeImageSequenceAssetId: sequenceId,
          activeAssetId: sequenceId,
          posterUrl: content.posterUrl || urls[0],
        })
        setNote({ ok: true, msg: `Uploaded ${urls.length} frames. Publish the website to show it publicly.` })
        refresh()
      } else {
        setNote({ ok: false, msg: 'Frame upload failed — local preview kept.' })
      }
    } finally { setBusy(null) }
  }, [tenantId, sectionId, patch, patchScrub, refresh, scrub.fps, content.posterUrl])

  // ── 3. Poster / Fallback ──────────────────────────────────────────────────
  const onPosterFile = useCallback(async (file: File) => {
    const tmp = trackTmp(URL.createObjectURL(file))
    patch({ posterUrl: tmp })
    if (!tenantId) return
    setBusy('poster'); setNote(null)
    try {
      const res = await uploadWebsite3DAsset(file, tenantId, { assetType: 'poster', sectionId, renderMode: 'video_scrub' })
      if (res?.url) { patch({ posterUrl: res.url, posterAssetId: res.asset?.id ?? null }); refresh() }
    } finally { setBusy(null) }
  }, [tenantId, sectionId, patch, refresh])

  const onFallbackFile = useCallback(async (file: File) => {
    const tmp = trackTmp(URL.createObjectURL(file))
    patch({ fallbackImageUrl: tmp })
    if (!tenantId) return
    setBusy('fallback'); setNote(null)
    try {
      const res = await uploadWebsite3DAsset(file, tenantId, { assetType: 'fallback', sectionId, renderMode: 'video_scrub' })
      if (res?.url) { patch({ fallbackImageUrl: res.url, fallbackAssetId: res.asset?.id ?? null }); refresh() }
    } finally { setBusy(null) }
  }, [tenantId, sectionId, patch, refresh])

  // ── "Use as hero" actions (from uploaded library) ───────────────────────────
  const activateVideoAsHero = useCallback((asset: Website3DAsset) => {
    if (!asset.public_url) return
    patch({
      renderMode: 'video_scrub', useImageSequence: false,
      videoUrl: asset.public_url, activeVideoAssetId: asset.id, activeAssetId: asset.id,
    })
    patchScrub({ enabled: true, mode: 'video' })
    setNote({ ok: true, msg: 'Set as active hero video. Publish to show it publicly.' })
  }, [patch, patchScrub])

  const activateSequenceAsHero = useCallback((asset: Website3DAsset) => {
    const frameUrls = Array.isArray(asset.metadata?.frameUrls)
      ? (asset.metadata!.frameUrls as unknown[]).filter((u): u is string => typeof u === 'string')
      : []
    const seqId = (asset.sequence_id ?? (asset.metadata?.sequenceId as string | undefined)) ?? asset.id
    patch({
      renderMode: 'video_scrub', useImageSequence: true,
      imageSequenceUrls: frameUrls.length > 1 ? frameUrls : content.imageSequenceUrls,
      activeImageSequenceAssetId: seqId, activeAssetId: seqId,
    })
    patchScrub({ enabled: true, mode: 'image_sequence' })
    setNote({ ok: true, msg: 'Set as active hero image sequence. Publish to show it publicly.' })
  }, [patch, patchScrub, content.imageSequenceUrls])

  // ── Active media state ───────────────────────────────────────────────────
  const activeMedia = useMemo(() => {
    if (scrub.mode === 'image_sequence') {
      const n = content.imageSequenceUrls?.length ?? 0
      return n > 1 ? `Image sequence · ${n} frames` : 'Image sequence (no frames yet)'
    }
    return content.videoUrl ? 'MP4 video' : 'No active video yet'
  }, [scrub.mode, content.imageSequenceUrls, content.videoUrl])

  const frameCount = content.imageSequenceUrls?.length ?? 0
  const renderModeNote =
    content.renderMode !== 'video_scrub'
      ? 'three_model (switch handled automatically when you upload below)'
      : scrub.mode === 'image_sequence' ? 'video_scrub · image_sequence' : 'video_scrub · video'

  if (!section) return null

  return (
    <div style={wrap}>
      <h3 style={title}>🎬 3D Hero Uploads</h3>
      <p style={sub}>
        Upload media here. Files preview instantly in the builder, upload to storage,
        then go live when you Publish. No Spline — MP4 video or image-sequence scrub only.
      </p>

      {note && (
        <div style={{
          fontSize: '0.72rem', lineHeight: 1.4, marginBottom: '0.75rem', padding: '0.5rem 0.65rem',
          borderRadius: '0.5rem',
          background: note.ok ? '#14532d22' : '#7f1d1d22',
          border: `1px solid ${note.ok ? '#22c55e55' : '#ef444455'}`,
          color: note.ok ? '#86efac' : '#fca5a5',
        }}>
          {note.msg}
        </div>
      )}

      {/* ── 1. Video Hero ── */}
      <h4 style={head}>1 · Video Hero</h4>
      <div style={card}>
        <label style={label}>Upload MP4 Video</label>
        <input
          type="file"
          accept="video/mp4,.mp4"
          style={fileInputStyle}
          disabled={busy === 'video'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onVideoFile(f); e.currentTarget.value = '' }}
        />
        {busy === 'video' && <p style={{ fontSize: '0.68rem', color: '#c9a84c', margin: '0.4rem 0 0' }}>Uploading video…</p>}
        <div style={{ fontSize: '0.68rem', color: '#8a8a93', marginTop: '0.5rem' }}>
          Current active video:{' '}
          <span style={{ color: content.videoUrl ? '#86efac' : '#71717a' }}>
            {content.videoUrl ? (localVideoName || 'video set') : 'none'}
          </span>
        </div>
        {content.videoUrl && (
          <div style={{ marginTop: '0.5rem', borderRadius: '0.4rem', overflow: 'hidden', background: '#000' }}>
            <video src={content.videoUrl} muted playsInline preload="metadata" controls
              style={{ width: '100%', maxHeight: 150, objectFit: scrub.objectFit }} />
          </div>
        )}
        <button
          onClick={() => { patch({ renderMode: 'video_scrub', useImageSequence: false }); patchScrub({ enabled: true, mode: 'video' }); setNote({ ok: true, msg: 'Using uploaded video as hero.' }) }}
          disabled={!content.videoUrl}
          style={primaryBtn(!content.videoUrl)}
        >
          Use uploaded video as hero
        </button>
      </div>

      {/* ── 2. Image Sequence Hero ── */}
      <h4 style={head}>2 · Image Sequence Hero</h4>
      <div style={card}>
        <label style={label}>Upload Image Sequence Frames</label>
        <input
          type="file"
          accept="image/*"
          multiple
          style={fileInputStyle}
          disabled={!!busy && busy.startsWith('image_sequence')}
          onChange={(e) => { if (e.target.files && e.target.files.length) void onSequenceFiles(e.target.files); e.currentTarget.value = '' }}
        />
        {busy?.startsWith('image_sequence') && (
          <p style={{ fontSize: '0.68rem', color: '#c9a84c', margin: '0.4rem 0 0' }}>
            Uploading frames… {busy.includes(':') ? busy.split(':')[1] : ''}
          </p>
        )}
        <div style={{ fontSize: '0.68rem', color: '#8a8a93', marginTop: '0.5rem' }}>
          Selected frames:{' '}
          <span style={{ color: frameCount > 1 ? '#86efac' : '#71717a' }}>
            {frameCount > 0 ? `${frameCount} frame${frameCount === 1 ? '' : 's'}` : (localSeqCount ? `${localSeqCount} selected` : 'none')}
          </span>
        </div>
        {frameCount > 0 && content.imageSequenceUrls && (
          <div style={{ marginTop: '0.5rem', borderRadius: '0.4rem', overflow: 'hidden', background: '#000' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content.imageSequenceUrls[0]} alt="First frame" style={{ width: '100%', maxHeight: 150, objectFit: scrub.objectFit }} />
          </div>
        )}
        <button
          onClick={() => { patch({ renderMode: 'video_scrub', useImageSequence: true }); patchScrub({ enabled: true, mode: 'image_sequence' }); setNote({ ok: true, msg: 'Using image sequence as hero.' }) }}
          disabled={frameCount < 2}
          style={primaryBtn(frameCount < 2)}
        >
          Use image sequence as hero
        </button>
      </div>

      {/* ── 3. Poster / Fallback ── */}
      <h4 style={head}>3 · Poster / Fallback</h4>
      <div style={card}>
        <label style={label}>Upload Poster Image</label>
        <input type="file" accept="image/*" style={fileInputStyle} disabled={busy === 'poster'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onPosterFile(f); e.currentTarget.value = '' }} />
        {content.posterUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content.posterUrl} alt="Poster" style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: '0.3rem', border: '1px solid #27272a' }} />
            <span style={{ fontSize: '0.66rem', color: '#86efac' }}>Poster set</span>
          </div>
        )}
        <label style={{ ...label, marginTop: '0.875rem' }}>Upload Fallback Image</label>
        <input type="file" accept="image/*" style={fileInputStyle} disabled={busy === 'fallback'}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFallbackFile(f); e.currentTarget.value = '' }} />
        {content.fallbackImageUrl && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.5rem' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content.fallbackImageUrl} alt="Fallback" style={{ width: 56, height: 36, objectFit: 'cover', borderRadius: '0.3rem', border: '1px solid #27272a' }} />
            <span style={{ fontSize: '0.66rem', color: '#86efac' }}>Fallback set</span>
          </div>
        )}
      </div>

      {/* ── Uploaded library quick-select ── */}
      {(groups.videos.length > 0 || groups.imageSequences.length > 0) && (
        <>
          <h4 style={head}>Uploaded media for this hero</h4>
          {groups.videos.map((a) => (
            <MediaRow key={a.id} asset={a} kind="video"
              active={a.id === content.activeVideoAssetId}
              actionLabel="Use this video as hero" onUse={() => activateVideoAsHero(a)} />
          ))}
          {groups.imageSequences.map((a) => {
            const seqId = (a.sequence_id ?? (a.metadata?.sequenceId as string | undefined)) ?? a.id
            return (
              <MediaRow key={a.id} asset={a} kind="image_sequence"
                active={seqId === content.activeImageSequenceAssetId}
                actionLabel="Use this image sequence as hero" onUse={() => activateSequenceAsHero(a)} />
            )
          })}
        </>
      )}

      {/* ── 4. Scrub Settings ── */}
      <h4 style={head}>4 · Scrub Settings</h4>
      <div style={card}>
        <CheckRow label="Enable scroll scrub" checked={!!scrub.enabled}
          onChange={(v) => { patchScrub({ enabled: v }) }} />
        <CheckRow label="Pin while scrolling" checked={!!scrub.pinOnScroll}
          onChange={(v) => { patchScrub({ pinOnScroll: v }); patch({ pinOnScroll: v }) }} />
        <div style={{ ...group, marginTop: '0.75rem' }}>
          <label style={label}>Scroll length (px)</label>
          <input type="number" min={400} max={6000} step={100} style={numInput}
            value={Math.round((content.scrollLength ?? 2.5) * 720)}
            onChange={(e) => { const px = Number(e.target.value) || 1800; const vh = +(px / 720).toFixed(2); patch({ scrollLength: vh }); patchScrub({ scrollLength: vh }) }} />
        </div>
        <div style={group}>
          <label style={label}>Scrub smoothing (0–1)</label>
          <input type="number" min={0} max={1} step={0.01} style={numInput}
            value={content.scrubSmoothing ?? 0.12}
            onChange={(e) => { const v = Math.min(1, Math.max(0, Number(e.target.value))); patch({ scrubSmoothing: v }); patchScrub({ scrubSmoothing: v }) }} />
        </div>
        <div style={group}>
          <label style={label}>Object fit</label>
          <Select value={scrub.objectFit}
            onChange={(v) => { patchScrub({ objectFit: v as 'cover' | 'contain' }); patch({ videoObjectFit: v as 'cover' | 'contain' }) }}
            options={[{ value: 'cover', label: 'Cover' }, { value: 'contain', label: 'Contain' }]} />
        </div>
        <div style={group}>
          <label style={label}>Mobile fallback</label>
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
          <label style={label}>Reduced-motion fallback</label>
          <Select value={scrub.reducedMotionFallback}
            onChange={(v) => { patchScrub({ reducedMotionFallback: v as VideoScrubSettings['reducedMotionFallback'] }); patch({ reducedMotionFallback: v as Premium3DScrollHeroContent['reducedMotionFallback'] }) }}
            options={[
              { value: 'poster', label: 'Poster image' },
              { value: 'static', label: 'Static fallback image' },
            ]} />
        </div>
      </div>

      {/* ── Active media + publish status ── */}
      <div style={{
        ...card, display: 'flex', flexDirection: 'column', gap: '0.3rem',
        border: '1px solid #3f3f46', background: '#111114',
      }}>
        <Row k="Active media" v={activeMedia} good={!!content.videoUrl || frameCount > 1} />
        <Row k="Status" v={saveStatus === 'saving' ? 'Saving draft…' : 'Draft saved'} good={saveStatus !== 'saving'} />
        <Row k="Publish" v={isPublished ? 'Published' : 'Publish required to go live'} good={isPublished} />
      </div>

      {/* ── 5. Diagnostics ── */}
      <h4 style={head}>5 · Diagnostics</h4>
      <div style={{ ...card, fontFamily: 'monospace', fontSize: '0.66rem', color: '#a1a1aa', lineHeight: 1.7 }}>
        <Diag k="section id" v={sectionId} />
        <Diag k="section type" v={section.section_type} />
        <Diag k="render mode" v={renderModeNote} />
        <Diag k="active video url" v={content.videoUrl ? content.videoUrl.slice(0, 48) + '…' : '—'} />
        <Diag k="active video asset id" v={content.activeVideoAssetId ?? '—'} />
        <Diag k="image sequence frame count" v={String(frameCount)} />
        <Diag k="active sequence id" v={content.activeImageSequenceAssetId ?? '—'} />
        <Diag k="poster url" v={content.posterUrl ? 'present' : '—'} />
        <Diag k="fallback url" v={content.fallbackImageUrl ? 'present' : '—'} />
        <Diag k="publish status" v={isPublished ? 'published' : 'publish required'} />
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', marginTop: '0.6rem', padding: '0.5rem', borderRadius: '0.5rem',
    border: '1px solid #c9a84c66', background: disabled ? '#1c1c1e' : '#c9a84c22',
    color: disabled ? '#52525b' : '#e9d8a6', fontSize: '0.74rem', fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

function CheckRow({ label: lbl, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.76rem', color: '#d4d4d8', cursor: 'pointer', padding: '0.2rem 0' }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: '#c9a84c', width: 15, height: 15 }} />
      {lbl}
    </label>
  )
}

function Diag({ k, v }: { k: string; v: string }) {
  return <div><span style={{ color: '#52525b' }}>{k}:</span> <span style={{ color: '#d4d4d8', wordBreak: 'break-all' }}>{v}</span></div>
}

function Row({ k, v, good }: { k: string; v: string; good: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem' }}>
      <span style={{ color: '#8a8a93' }}>{k}</span>
      <span style={{ color: good ? '#86efac' : '#fcd34d' }}>{v}</span>
    </div>
  )
}

function MediaRow({
  asset, kind, active, actionLabel, onUse,
}: {
  asset: Website3DAsset; kind: 'video' | 'image_sequence'; active: boolean; actionLabel: string; onUse: () => void
}) {
  return (
    <div style={{
      ...card, marginBottom: '0.5rem', padding: '0.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center',
      border: active ? '1px solid #22c55e66' : '1px solid #27272a',
      background: active ? '#14532d1a' : '#141416',
    }}>
      <div style={{ width: 46, height: 46, borderRadius: '0.35rem', overflow: 'hidden', background: '#000', flexShrink: 0 }}>
        {kind === 'video' && asset.public_url ? (
          <video src={asset.public_url} muted playsInline preload="metadata" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : asset.public_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.public_url} alt={asset.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52525b' }}>🎞</div>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.7rem', color: '#e4e4e7', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{asset.name}</div>
        {active && (
          <span style={{ fontSize: '0.56rem', color: '#4ade80', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ● {kind === 'video' ? 'Active Hero Video' : 'Active Hero Image Sequence'}
          </span>
        )}
        <button onClick={onUse} style={{
          display: 'block', marginTop: '0.3rem', padding: '0.25rem 0.5rem', borderRadius: '0.35rem',
          border: '1px solid #c9a84c66', background: '#c9a84c22', color: '#e9d8a6', fontSize: '0.64rem', cursor: 'pointer',
        }}>{actionLabel}</button>
      </div>
    </div>
  )
}

export default Premium3DHeroUploadPanel
