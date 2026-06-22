// components/website/3d/Premium3DScrollHero.tsx
//
// SERVER-SAFE wrapper for the Premium 3D Scroll Hero section.
//  - No 'use client'; safe to render from Server Components.
//  - Normalizes raw content defensively (never throws).
//  - Renders the interactive scene only through the client component, which
//    itself dynamically imports the heavy WebGL/video code with ssr:false.
//  - Copy + CTA + a <noscript> fallback image are emitted server-side so the
//    section is SEO-friendly and degrades gracefully without JavaScript.
//  - Never uses browser-only APIs directly.

import { normalizeScrollHeroContent } from '@/lib/website/premium3d/types'
import { Premium3DScrollHeroClient } from './Premium3DScrollHeroClient'

interface Props {
  content: unknown
  mode?:   'public' | 'preview' | 'editor'
}

export function Premium3DScrollHero({ content, mode = 'public' }: Props) {
  const normalized = normalizeScrollHeroContent(content)
  const isPreview = mode !== 'public'

  const noscriptSrc =
    normalized.fallbackImageUrl ||
    normalized.posterUrl ||
    (normalized.imageSequenceUrls && normalized.imageSequenceUrls[0]) ||
    null

  return (
    <>
      <Premium3DScrollHeroClient content={normalized} isPreview={isPreview} />
      {noscriptSrc ? (
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={noscriptSrc}
            alt={normalized.headline}
            style={{ width: '100%', height: 'auto', display: 'block' }}
          />
        </noscript>
      ) : null}
    </>
  )
}

export default Premium3DScrollHero
