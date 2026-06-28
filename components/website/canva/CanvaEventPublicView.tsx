'use client'
// components/website/canva/CanvaEventPublicView.tsx
// Public render of a config-backed Canva Invitation/Event website: the preserved
// Canva embed plus native NexoraNow POV actions (Event Camera / Gallery / Log In)
// which stay available whether or not the Canva embed succeeds.

import { CanvaPreserveEmbed } from './CanvaPreserveEmbed'

interface Props {
  embedUrl?: string | null
  sourceUrl?: string | null
  embedCode?: string | null
  isCustomCanvaDomain?: boolean
  title: string
  cameraHref?: string | null
  galleryHref?: string | null
  loginHref?: string | null
  rsvpHref?: string | null
  isDraftPreview?: boolean
}

export function CanvaEventPublicView({
  embedUrl, sourceUrl, embedCode, isCustomCanvaDomain, title,
  cameraHref, galleryHref, loginHref, rsvpHref, isDraftPreview,
}: Props) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--color-bg,#0b0b0b)' }}>
      {isDraftPreview && (
        <div style={{ background: '#7c3aed', color: '#fff', textAlign: 'center', padding: '0.5rem 1rem', fontSize: '0.8125rem', fontWeight: 600 }}>
          Draft preview — this is how your event website will look once published.
        </div>
      )}

      <CanvaPreserveEmbed
        src={embedUrl ?? undefined}
        sourceUrl={sourceUrl ?? undefined}
        embedCode={embedCode ?? undefined}
        isCustomCanvaDomain={isCustomCanvaDomain}
        title={title}
        fillViewport
        eventCameraUrl={cameraHref ?? undefined}
        galleryUrl={galleryHref ?? undefined}
        loginUrl={loginHref ?? undefined}
        rsvpUrl={rsvpHref ?? undefined}
        showNativeActions
      />
    </main>
  )
}
