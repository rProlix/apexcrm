'use client'

// components/website/premium/ScrollHeroDiagnosticsClient.tsx
// Renders Premium 3D Scroll Hero diagnostics + runs browser capability checks
// (WebGL, video scroll-scrub support, reduced motion) on the client.

import { useEffect, useState } from 'react'
import type { ScrollHeroDiagnostics } from '@/lib/website/premium3d/diagnostics'

interface Props {
  diagnostics: ScrollHeroDiagnostics
}

interface BrowserCaps {
  webgl:        boolean
  webgl2:       boolean
  videoScrub:   boolean
  reducedMotion: boolean
  coarsePointer: boolean
}

function detectCaps(): BrowserCaps {
  let webgl = false
  let webgl2 = false
  try {
    const canvas = document.createElement('canvas')
    webgl = !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    webgl2 = !!canvas.getContext('webgl2')
  } catch { /* noop */ }
  const video = document.createElement('video')
  const videoScrub = !!video.canPlayType && video.canPlayType('video/mp4; codecs="avc1.42E01E"') !== ''
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false
  return { webgl, webgl2, videoScrub, reducedMotion, coarsePointer }
}

const card: React.CSSProperties = {
  background: '#111113', border: '1px solid #27272a', borderRadius: '0.75rem', padding: '1.25rem', marginBottom: '1rem',
}
const head: React.CSSProperties = { margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 700, color: '#f4f4f5' }
const pill = (ok: boolean): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
  fontSize: '0.75rem', fontWeight: 600, padding: '0.2rem 0.6rem', borderRadius: '999px',
  background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
  color: ok ? '#4ade80' : '#f87171',
})

export function ScrollHeroDiagnosticsClient({ diagnostics }: Props) {
  const [caps, setCaps] = useState<BrowserCaps | null>(null)
  useEffect(() => { setCaps(detectCaps()) }, [])

  const d = diagnostics

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif', color: '#e4e4e7', maxWidth: 900 }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: '0 0 0.25rem' }}>Premium 3D Scroll Hero — Diagnostics</h1>
      <p style={{ color: '#71717a', fontSize: '0.875rem', margin: '0 0 1.5rem' }}>
        No Spline is used. Render modes: Three.js 3D models and H.264 MP4 / image-sequence scroll-scrubbing.
      </p>

      {/* Browser capabilities */}
      <div style={card}>
        <h2 style={head}>Browser capabilities (this device)</h2>
        {!caps ? <p style={{ color: '#71717a', fontSize: '0.8125rem' }}>Detecting…</p> : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={pill(caps.webgl)}>{caps.webgl ? '✓' : '✕'} WebGL</span>
            <span style={pill(caps.webgl2)}>{caps.webgl2 ? '✓' : '✕'} WebGL2</span>
            <span style={pill(caps.videoScrub)}>{caps.videoScrub ? '✓' : '✕'} H.264 video</span>
            <span style={pill(!caps.reducedMotion)}>{caps.reducedMotion ? '⚠' : '✓'} Reduced motion {caps.reducedMotion ? 'ON (static fallback)' : 'off'}</span>
            <span style={pill(!caps.coarsePointer)}>{caps.coarsePointer ? '📱' : '🖥'} {caps.coarsePointer ? 'Mobile/touch' : 'Desktop'}</span>
          </div>
        )}
      </div>

      {/* Dependencies */}
      <div style={card}>
        <h2 style={head}>Dependencies</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.4rem' }}>
          {d.dependencies.map((dep) => (
            <div key={dep.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
              <span style={{ fontFamily: 'monospace', color: '#a78bfa' }}>{dep.name}</span>
              <span style={{ color: '#71717a' }}>{dep.purpose}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary */}
      <div style={card}>
        <h2 style={head}>Status</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <span style={pill(d.isPublished)}>{d.isPublished ? 'Published' : 'Draft only'}</span>
          <span style={pill(true)}>{d.sectionCount} hero section(s)</span>
          <span style={pill(d.summary.sectionsWithMissingAssets === 0)}>{d.summary.sectionsWithMissingAssets} missing assets</span>
          <span style={pill(d.summary.invalidRenderModes === 0)}>{d.summary.invalidRenderModes} invalid render modes</span>
          <span style={pill(d.summary.sectionsMissingPoster === 0)}>{d.summary.sectionsMissingPoster} missing posters</span>
          <span style={pill(d.summary.sectionsMissingFallback === 0)}>{d.summary.sectionsMissingFallback} missing fallbacks</span>
        </div>
      </div>

      {/* Sections */}
      <div style={card}>
        <h2 style={head}>Sections</h2>
        {d.sections.length === 0 ? (
          <p style={{ color: '#71717a', fontSize: '0.8125rem' }}>No Premium 3D Scroll Hero sections yet.</p>
        ) : d.sections.map((s) => (
          <div key={s.sectionId} style={{ padding: '0.75rem 0', borderTop: '1px solid #1c1c1e' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '0.875rem' }}>{s.headline || '(no headline)'}</strong>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <span style={pill(true)}>{s.renderMode}</span>
                <span style={pill(s.pageStatus === 'published')}>{s.pageStatus}</span>
                <span style={pill(s.isVisible)}>{s.isVisible ? 'visible' : 'hidden'}</span>
              </div>
            </div>
            {s.renderMode === 'video_scrub' && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.7rem', color: '#a1a1aa' }}>
                {s.videoUrlPresent ? '● video set' : '○ no video'}
                {' · '}{s.imageSequenceFrameCount > 0 ? `${s.imageSequenceFrameCount} frames` : 'no sequence'}
                {' · '}{s.posterUrlPresent ? 'poster ✓' : 'poster ✗'}
                {' · '}{s.fallbackUrlPresent ? 'fallback ✓' : 'fallback ✗'}
                {' · '}{s.isLive ? 'LIVE' : 'draft only'}
              </p>
            )}
            {s.issues.map((i, idx) => (
              <p key={`i${idx}`} style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#f87171' }}>✕ {i}</p>
            ))}
            {s.warnings.map((w, idx) => (
              <p key={`w${idx}`} style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#fbbf24' }}>⚠ {w}</p>
            ))}
            {s.issues.length === 0 && s.warnings.length === 0 && (
              <p style={{ margin: '0.35rem 0 0', fontSize: '0.75rem', color: '#4ade80' }}>✓ No issues</p>
            )}
          </div>
        ))}
      </div>

      {/* Assets */}
      <div style={card}>
        <h2 style={head}>3D / Video assets ({d.assets.total})</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
          {Object.entries(d.assets.byType).map(([t, n]) => (
            <span key={t} style={pill(true)}>{t}: {n}</span>
          ))}
        </div>
        {d.assets.brokenUrls.map((b) => (
          <p key={b.id} style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#f87171' }}>✕ {b.name}: {b.reason}</p>
        ))}
        {d.assets.largeWarnings.map((b) => (
          <p key={b.id} style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: '#fbbf24' }}>⚠ {b.name}: large file ({b.sizeMb} MB)</p>
        ))}
      </div>
    </div>
  )
}
