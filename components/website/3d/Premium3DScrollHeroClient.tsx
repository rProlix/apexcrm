'use client'

// components/website/3d/Premium3DScrollHeroClient.tsx
// Client orchestrator for the Premium 3D Scroll Hero.
//
// Responsibilities:
//  - Choose between three_model and video_scrub render paths
//  - Respect prefers-reduced-motion (disable heavy scene → static fallback)
//  - Respect mobile fallback behaviour
//  - Drive scroll progress + optional pin via GSAP ScrollTrigger (client only)
//  - Optionally enable Lenis smooth scroll (client only)
//  - Swap palette CSS vars via IntersectionObserver
//  - Pause scene rendering when off-screen; clean up RAF + ScrollTriggers
//  - NEVER crash: an error boundary falls back to image / premium gradient
//
// Heavy WebGL/video code lives in separately, dynamically-imported (ssr:false)
// scene components so it never reaches the server bundle.

import dynamic from 'next/dynamic'
import { useCallback, useRef, useState } from 'react'
import {
  hasUsableAsset,
  type Premium3DScrollHeroContent,
} from '@/lib/website/premium3d/types'
import { useReducedMotion, useIsMobile } from './useReducedMotion'
import { useScrollProgress } from './useScrollProgress'
import { useLenisScroll } from './useLenisScroll'
import { ScrollHeadline } from './ScrollHeadline'
import { ScrollHeroErrorBoundary } from './ScrollHeroErrorBoundary'
import { SectionPaletteObserver } from './SectionPaletteObserver'

const SceneLoader = () => (
  <div
    style={{
      position: 'absolute', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      color: 'var(--section-muted)', fontSize: '0.8125rem',
    }}
  >
    Loading scene…
  </div>
)

// Imported via the bundler-only alias `@three-hero/*` so React-Three-Fiber's
// global JSX augmentation never enters the app-wide TypeScript program.
// (See types/three-hero.d.ts and the webpack alias in next.config.js.)
const ThreeScrollScene = dynamic(() => import('@three-hero/ThreeScrollScene'), {
  ssr: false,
  loading: SceneLoader,
})
const VideoScrubScene = dynamic(() => import('./VideoScrubScene'), {
  ssr: false,
  loading: SceneLoader,
})
const ImageSequenceScrubScene = dynamic(() => import('./ImageSequenceScrubScene'), {
  ssr: false,
  loading: SceneLoader,
})

interface Props {
  content:    Premium3DScrollHeroContent
  /** Builder preview can show a demo scene even with no asset */
  isPreview?: boolean
}

export function Premium3DScrollHeroClient({ content, isPreview = false }: Props) {
  const sectionRef = useRef<HTMLElement>(null)
  const pinRef     = useRef<HTMLDivElement>(null)

  const reduced  = useReducedMotion()
  const isMobile = useIsMobile()
  const [sceneVisible, setSceneVisible] = useState(true)

  const hasAsset = hasUsableAsset(content)
  const allowInteractiveOnMobile =
    content.mobileFallbackMode === 'fullScrub' || content.mobileFallbackMode === 'lowRes'

  const canInteract =
    content.renderMode === 'three_model'
      ? hasAsset || isPreview          // demo object allowed in preview
      : hasAsset                        // video/sequence needs a real asset

  const interactive =
    !reduced && canInteract && (!isMobile || allowInteractiveOnMobile)

  const pin = interactive && content.pinOnScroll !== false

  const onVisibilityChange = useCallback((v: boolean) => setSceneVisible(v), [])

  const { progressRef } = useScrollProgress({
    triggerRef: pinRef,
    pinRef,
    scrollLength: content.scrollLength ?? 2.5,
    pin,
    smoothing: content.scrubSmoothing ?? 0.12,
    enabled: interactive,
    onVisibilityChange,
  })

  // Lenis only when interactive (and not reduced motion).
  useLenisScroll({ enabled: interactive })

  const palette = content.palette ?? {
    background: '#0b0b12', foreground: '#f5f5f7',
    accent: '#7c3aed', muted: '#a1a1aa', glow: '#a855f7',
  }

  // section-scoped CSS variables (always present)
  const cssVars = {
    '--section-bg':     palette.background,
    '--section-fg':     palette.foreground,
    '--section-accent': palette.accent,
    '--section-muted':  palette.muted,
    '--section-glow':   palette.glow,
  } as React.CSSProperties

  // ── Static fallback visual (reduced motion / mobile / no asset / error) ──
  const fallbackSrc =
    content.fallbackImageUrl ||
    content.posterUrl ||
    (content.imageSequenceUrls && content.imageSequenceUrls[0]) ||
    null

  const FallbackVisual = (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {fallbackSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fallbackSrc}
          alt={content.headline}
          style={{ width: '100%', height: '100%', objectFit: content.videoObjectFit === 'contain' ? 'contain' : 'cover' }}
        />
      ) : (
        <div
          style={{
            width: '100%', height: '100%',
            background: `radial-gradient(120% 120% at 30% 20%, ${palette.glow}33 0%, ${palette.background} 55%), linear-gradient(160deg, ${palette.background} 0%, #000 100%)`,
          }}
        />
      )}
    </div>
  )

  // ── Interactive scene ──
  let scene: React.ReactNode = null
  if (interactive) {
    if (content.renderMode === 'three_model') {
      scene = <ThreeScrollScene content={content} progressRef={progressRef} active={sceneVisible} />
    } else if (content.useImageSequence && (content.imageSequenceUrls?.length ?? 0) > 1) {
      scene = <ImageSequenceScrubScene content={content} progressRef={progressRef} active={sceneVisible} />
    } else {
      scene = <VideoScrubScene content={content} progressRef={progressRef} active={sceneVisible} />
    }
  }

  return (
    <section
      ref={sectionRef}
      data-section="premium-3d-scroll-hero"
      style={{
        ...cssVars,
        position: 'relative',
        background: 'var(--section-bg)',
        color: 'var(--section-fg)',
      }}
    >
      <SectionPaletteObserver
        palette={palette}
        applyGlobally={content.applyPaletteGlobally}
        targetRef={sectionRef}
      />

      {/* Pinned / sticky visual stage */}
      <div
        ref={pinRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100vh',
          minHeight: 480,
          overflow: 'hidden',
        }}
      >
        {/* Scene or fallback layer */}
        <div style={{ position: 'absolute', inset: 0 }}>
          {interactive ? (
            <ScrollHeroErrorBoundary fallback={FallbackVisual}>
              {scene}
            </ScrollHeroErrorBoundary>
          ) : (
            FallbackVisual
          )}
          {/* readability scrim */}
          <div
            style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.0) 35%, rgba(0,0,0,0.45) 100%)',
            }}
          />
        </div>

        {/* Overlay copy */}
        <div
          style={{
            position: 'relative', zIndex: 2, height: '100%',
            display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
            padding: 'clamp(1.5rem, 5vw, 5rem)', maxWidth: 880,
          }}
        >
          {content.eyebrow ? (
            <p style={{
              margin: 0, marginBottom: '0.75rem', textTransform: 'uppercase',
              letterSpacing: '0.18em', fontSize: '0.75rem', fontWeight: 700,
              color: 'var(--section-accent)',
            }}>
              {content.eyebrow}
            </p>
          ) : null}

          <ScrollHeadline
            text={content.headline}
            animation={reduced ? 'none' : content.textAnimation}
            as="h1"
            disabled={reduced}
            style={{
              margin: 0,
              fontSize: 'clamp(2rem, 6vw, 4.5rem)',
              lineHeight: 1.02,
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: 'var(--section-fg)',
            }}
          />

          {content.subheadline ? (
            <p style={{
              margin: '1rem 0 0', maxWidth: 560,
              fontSize: 'clamp(1rem, 2vw, 1.25rem)', lineHeight: 1.5,
              color: 'var(--section-muted)',
            }}>
              {content.subheadline}
            </p>
          ) : null}

          {(content.ctaPrimary || content.ctaSecondary) && (
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.75rem', flexWrap: 'wrap' }}>
              {content.ctaPrimary ? (
                <a
                  href={content.ctaPrimary.href || '#'}
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '0.85rem 1.6rem', borderRadius: '999px',
                    fontWeight: 700, fontSize: '0.95rem', textDecoration: 'none',
                    background: 'var(--section-accent)', color: '#fff',
                    boxShadow: `0 8px 30px var(--section-glow)55`,
                  }}
                >
                  {content.ctaPrimary.label}
                </a>
              ) : null}
              {content.ctaSecondary ? (
                <a
                  href={content.ctaSecondary.href || '#'}
                  style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '0.85rem 1.6rem', borderRadius: '999px',
                    fontWeight: 600, fontSize: '0.95rem', textDecoration: 'none',
                    background: 'transparent', color: 'var(--section-fg)',
                    border: '1px solid var(--section-muted)',
                  }}
                >
                  {content.ctaSecondary.label}
                </a>
              ) : null}
            </div>
          )}

          {/* Builder-only hint when an asset is still needed */}
          {isPreview && !hasAsset ? (
            <p style={{
              margin: '1.25rem 0 0', fontSize: '0.75rem',
              color: 'var(--section-muted)', opacity: 0.85,
            }}>
              {content.renderMode === 'three_model'
                ? 'Preview shows a demo object. Upload a GLB/GLTF model for the full effect.'
                : 'Upload an H.264 MP4 or image sequence to enable scroll scrubbing.'}
            </p>
          ) : null}

          {/* Scroll cue */}
          {interactive && pin ? (
            <p aria-hidden="true" style={{
              margin: '1.5rem 0 0', fontSize: '0.6875rem',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: 'var(--section-muted)', opacity: 0.7,
            }}>
              ↓ Scroll to explore
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

export default Premium3DScrollHeroClient
