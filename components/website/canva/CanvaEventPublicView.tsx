'use client'
// components/website/canva/CanvaEventPublicView.tsx
// Public render of a config-backed Canva Invitation/Event website: the preserved
// Canva embed plus native NexoraNow POV CTAs (Event Camera / Gallery) when the
// event has POV enabled. Shows a draft banner when an editor previews the draft.

import { CanvaPreserveEmbed } from './CanvaPreserveEmbed'

interface Props {
  embedUrl?: string | null
  sourceUrl?: string | null
  title: string
  cameraHref?: string | null
  galleryHref?: string | null
  isDraftPreview?: boolean
}

const ctaStyle: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 6,
  padding: '0.625rem 1.25rem', borderRadius: 999, fontSize: '0.875rem', fontWeight: 600,
  color: '#fff', background: 'linear-gradient(135deg,#7c3aed,#db2777)', textDecoration: 'none',
}

export function CanvaEventPublicView({ embedUrl, sourceUrl, title, cameraHref, galleryHref, isDraftPreview }: Props) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg,#0b0b0b)' }}>
      {isDraftPreview && (
        <div style={{ background: '#7c3aed', color: '#fff', textAlign: 'center', padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 600 }}>
          Draft preview — this is how your event website will look once published.
        </div>
      )}

      {embedUrl ? (
        <CanvaPreserveEmbed src={embedUrl} title={title} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', padding: '3rem 1rem', textAlign: 'center' }}>
          <p style={{ color: 'var(--color-muted,#999)', maxWidth: 520 }}>
            This Canva event website could not be embedded here.
          </p>
          {sourceUrl && (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={ctaStyle}>Open Canva Website ↗</a>
          )}
        </div>
      )}

      {(cameraHref || galleryHref) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.75rem', padding: '1.5rem 1rem 3rem' }}>
          {cameraHref && <a href={cameraHref} style={ctaStyle}>Open Event Camera</a>}
          {galleryHref && <a href={galleryHref} style={{ ...ctaStyle, background: 'transparent', border: '1px solid rgba(255,255,255,0.25)' }}>View Gallery</a>}
        </div>
      )}
    </main>
  )
}
