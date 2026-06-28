'use client'
// components/website/canva/CanvaPreserveEmbed.tsx
// Public renderer for Preserve Canva Mode.
//
// Embedding model:
//  - We ALWAYS attempt the iframe first when a safe iframe src exists.
//  - Cross-origin iframes are expected — we never read their DOM, and an
//    inability to inspect contentWindow is NOT treated as a failure.
//  - The "Open Canva Website" fallback only appears when there is no valid
//    iframe src, or the iframe fires a real onError. After a long load timeout
//    we surface a small, non-alarming "Open in new tab" affordance but KEEP the
//    iframe visible (Canva can be slow; cross-origin blocks rarely fire events).
//  - Native NexoraNow actions (Event Camera / Gallery / Log In / RSVP) render in
//    a separate bar so POV features work whether or not the embed succeeds.

import { useEffect, useMemo, useRef, useState } from 'react'
import { parseCanvaEmbedSource } from '@/lib/website/canva/canva-url'

export type CanvaEmbedStatus = 'loading' | 'loaded' | 'timeout' | 'failed' | 'no_source'

interface NativeAction { label: string; href: string }

interface Props {
  /** Legacy: an already-resolved, safe iframe src. */
  src?: string | null
  /** Preferred: raw Canva URL + optional embed code (resolved client-side). */
  sourceUrl?: string | null
  embedCode?: string | null
  isCustomCanvaDomain?: boolean

  title?: string
  /** Ratio mode (e.g. 56.25 for 16:9). When omitted, fills the viewport height. */
  aspectPercent?: number
  fillViewport?: boolean

  eventCameraUrl?: string | null
  galleryUrl?: string | null
  loginUrl?: string | null
  rsvpUrl?: string | null
  showNativeActions?: boolean

  onStatusChange?: (status: CanvaEmbedStatus, info: { iframeSrc: string | null; reason?: string }) => void
}

const LOAD_TIMEOUT_MS = 11000

export function CanvaPreserveEmbed({
  src, sourceUrl, embedCode, isCustomCanvaDomain,
  title, aspectPercent, fillViewport,
  eventCameraUrl, galleryUrl, loginUrl, rsvpUrl, showNativeActions = true,
  onStatusChange,
}: Props) {
  // Resolve the iframe src once. A pre-resolved `src` wins (already validated).
  const resolved = useMemo(() => {
    if (src) return { iframeSrc: src, externalUrl: src, requiresFallback: false }
    const parsed = parseCanvaEmbedSource({ canvaUrl: sourceUrl, embedCode, isCustomCanvaDomain })
    return {
      iframeSrc: parsed.iframeSrc,
      externalUrl: parsed.normalizedUrl ?? sourceUrl ?? null,
      requiresFallback: !parsed.iframeSrc,
    }
  }, [src, sourceUrl, embedCode, isCustomCanvaDomain])

  const [status, setStatus] = useState<CanvaEmbedStatus>(resolved.iframeSrc ? 'loading' : 'no_source')
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (!resolved.iframeSrc) { setStatus('no_source'); return }
    setStatus('loading')
    const t = setTimeout(() => {
      // Timeout does NOT mean failure — Canva may simply be slow, or the
      // cross-origin load event may not have fired. Keep the iframe, surface a
      // gentle affordance only.
      setStatus((s) => (s === 'loading' ? 'timeout' : s))
    }, LOAD_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [resolved.iframeSrc])

  useEffect(() => {
    onStatusChange?.(status, { iframeSrc: resolved.iframeSrc, reason: status === 'failed' ? 'iframe onError' : status === 'no_source' ? 'no valid iframe src' : undefined })
  }, [status, resolved.iframeSrc, onStatusChange])

  const showFullFallback = status === 'no_source' || status === 'failed'
  const showSoftHint = status === 'timeout'

  const ratioMode = typeof aspectPercent === 'number' && !fillViewport
  const containerStyle: React.CSSProperties = ratioMode
    ? { position: 'relative', width: '100%', height: 0, paddingTop: `${aspectPercent}%`, overflow: 'hidden', background: 'var(--color-surface, #0b0b0b)' }
    : { position: 'relative', width: '100%', minHeight: '100vh', background: 'var(--color-surface, #0b0b0b)' }
  const iframeStyle: React.CSSProperties = ratioMode
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }
    : { display: 'block', width: '100%', minHeight: '100vh', border: 'none' }

  const actions = buildActions({ eventCameraUrl, galleryUrl, loginUrl, rsvpUrl })

  return (
    <section style={{ background: 'var(--color-bg)', position: 'relative' }}>
      {!showFullFallback && resolved.iframeSrc && (
        <div style={containerStyle}>
          <iframe
            ref={frameRef}
            src={resolved.iframeSrc}
            title={title || 'Canva event website'}
            loading="lazy"
            onLoad={() => setStatus('loaded')}
            onError={() => setStatus('failed')}
            allowFullScreen
            allow="fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-presentation allow-popups-to-escape-sandbox"
            style={iframeStyle}
          />

          {showSoftHint && resolved.externalUrl && (
            <a
              href={resolved.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                position: 'absolute', top: 12, right: 12, zIndex: 5,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '0.4rem 0.8rem', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600,
                color: '#fff', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
                border: '1px solid rgba(255,255,255,0.2)', textDecoration: 'none',
              }}
            >
              Open in new tab ↗
            </a>
          )}
        </div>
      )}

      {showFullFallback && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '3rem 1rem', textAlign: 'center', minHeight: ratioMode ? undefined : '40vh', justifyContent: 'center' }}>
          <p style={{ color: 'var(--color-text)', fontSize: '1rem', fontWeight: 600 }}>
            This Canva website can’t be embedded here
          </p>
          <p style={{ color: 'var(--color-muted)', fontSize: '0.8125rem', maxWidth: 520 }}>
            The Canva site or its custom domain blocks embedding. You can open it in a new tab — Event Camera and Gallery still work below.
          </p>
          {resolved.externalUrl && (
            <a href={resolved.externalUrl} target="_blank" rel="noopener noreferrer" style={primaryCta}>
              Open Canva Website ↗
            </a>
          )}
        </div>
      )}

      {showNativeActions && actions.length > 0 && (
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.625rem',
            padding: '1rem', position: 'sticky', bottom: 0, zIndex: 4,
            background: 'linear-gradient(to top, rgba(0,0,0,0.85), rgba(0,0,0,0))',
          }}
        >
          {actions.map((a, i) => (
            <a key={a.label} href={a.href} style={i === 0 ? primaryCta : secondaryCta}>{a.label}</a>
          ))}
        </div>
      )}
    </section>
  )
}

function buildActions(opts: { eventCameraUrl?: string | null; galleryUrl?: string | null; loginUrl?: string | null; rsvpUrl?: string | null }): NativeAction[] {
  const out: NativeAction[] = []
  if (opts.eventCameraUrl) out.push({ label: 'Open Event Camera', href: opts.eventCameraUrl })
  if (opts.galleryUrl) out.push({ label: 'View Gallery', href: opts.galleryUrl })
  if (opts.loginUrl) out.push({ label: 'Log In', href: opts.loginUrl })
  if (opts.rsvpUrl) out.push({ label: 'RSVP / Event Details', href: opts.rsvpUrl })
  return out
}

const primaryCta: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '0.625rem 1.25rem', borderRadius: 999, fontSize: '0.875rem', fontWeight: 600,
  color: '#fff', background: 'linear-gradient(135deg,#7c3aed,#db2777)', textDecoration: 'none',
}

const secondaryCta: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '0.625rem 1.25rem', borderRadius: 999, fontSize: '0.875rem', fontWeight: 600,
  color: '#fff', background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', textDecoration: 'none',
}
