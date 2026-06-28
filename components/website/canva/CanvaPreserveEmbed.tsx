'use client'
// components/website/canva/CanvaPreserveEmbed.tsx
// Renders a validated Canva published design inside a safe, responsive, sandboxed
// iframe for Preserve Canva Mode. If the design's domain blocks embedding
// (X-Frame-Options / frame-ancestors) the iframe stays blank, so we always show
// a fallback "Open Canva Website" button and surface a friendly message after a
// short load timeout. Native POV CTAs are rendered as separate NexoraNow sections.

import { useEffect, useRef, useState } from 'react'

interface Props {
  src:           string
  title?:        string
  aspectPercent?: number
}

export function CanvaPreserveEmbed({ src, title, aspectPercent = 56.25 }: Props) {
  const [loaded, setLoaded] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 6000)
    return () => clearTimeout(t)
  }, [])

  const showFallbackNote = timedOut && !loaded

  return (
    <section style={{ background: 'var(--color-bg)', padding: '0 0 1rem' }}>
      <div style={{ position: 'relative', width: '100%', height: 0, paddingTop: `${aspectPercent}%`, overflow: 'hidden', background: 'var(--color-surface, #0b0b0b)' }}>
        <iframe
          ref={frameRef}
          src={src}
          title={title || 'Canva event website'}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          allowFullScreen
          allow="fullscreen"
          referrerPolicy="no-referrer-when-downgrade"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem' }}>
        {showFallbackNote && (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.8125rem', textAlign: 'center', maxWidth: 520 }}>
            This Canva site could not be embedded, but guests can open it in a new tab. Event Camera and Gallery still work below.
          </p>
        )}
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '0.5rem 1rem', borderRadius: 999, fontSize: '0.8125rem', fontWeight: 600,
            color: 'var(--color-text)', border: '1px solid var(--color-border, rgba(255,255,255,0.15))',
            textDecoration: 'none',
          }}
        >
          Open Canva Website ↗
        </a>
      </div>
    </section>
  )
}
