'use client'

// components/site/premium/ProductStoryScroll.tsx
// Premium scroll-driven product storytelling component.
// Features a sticky product stage that updates as the user scrolls through text panels.
// Uses CSS transforms + IntersectionObserver — no heavy deps unless 360 spin is enabled.

import { useEffect, useRef, useState, useCallback } from 'react'

export interface ProductStoryScene {
  headline:    string
  description: string
  accentColor?: string
}

export interface ProductStoryScrollProps {
  /** Featured product image URL */
  stickyProductImageUrl?: string | null
  /** Array of text scenes */
  productStoryScenes?:    ProductStoryScene[]
  /** Optional product ID for 360 spin embed */
  featuredProductId?:     string | null
  /** Whether to use 360 viewer if available (lazy loads 3d viewer) */
  use360IfAvailable?:     boolean
  /** Fallback heading when no scenes are configured */
  headline?:              string
  subheadline?:           string
  /** Text color for scenes */
  textColor?:             string
  backgroundColor?:       string
}

const DEFAULT_SCENES: ProductStoryScene[] = [
  { headline: 'Crafted to Perfection', description: 'Every detail considered. Every choice intentional.' },
  { headline: 'Experience the Difference', description: 'See why customers love what we create.' },
  { headline: 'Yours to Enjoy', description: 'Ready when you are. Order yours today.' },
]

export function ProductStoryScroll({
  stickyProductImageUrl,
  productStoryScenes,
  featuredProductId,
  use360IfAvailable = false,
  headline = 'Our Signature Product',
  subheadline,
  textColor = '#f5f5f7',
  backgroundColor = '#000000',
}: ProductStoryScrollProps) {
  const scenes = (productStoryScenes?.length ?? 0) > 0 ? productStoryScenes! : DEFAULT_SCENES
  const [activeScene, setActiveScene]     = useState(0)
  const [imageScale, setImageScale]       = useState(1)
  const [imageTranslateY, setImageTranslateY] = useState(0)
  const [imageOpacity, setImageOpacity]   = useState(1)
  const [hasScrolled, setHasScrolled]     = useState(false)
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([])
  const stageRef  = useRef<HTMLDivElement>(null)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReducedMotion(mq.matches)
    setIsMobile(window.innerWidth < 768)
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler, { passive: true })
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Intersection observer for scene activation
  useEffect(() => {
    if (prefersReducedMotion || isMobile) return
    const observers: IntersectionObserver[] = []

    sceneRefs.current.forEach((el, i) => {
      if (!el) return
      const obs = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && entry.intersectionRatio > 0.4) {
              setActiveScene(i)
              setHasScrolled(true)
            }
          }
        },
        { threshold: 0.4 },
      )
      obs.observe(el)
      observers.push(obs)
    })

    return () => observers.forEach((o) => o.disconnect())
  }, [prefersReducedMotion, isMobile])

  // Scroll-driven product image parallax
  const handleScroll = useCallback(() => {
    if (prefersReducedMotion || isMobile || !stageRef.current) return
    const rect = stageRef.current.getBoundingClientRect()
    const windowH = window.innerHeight
    const progress = Math.max(0, Math.min(1, 1 - rect.bottom / (windowH + rect.height)))

    setImageTranslateY(-(progress * 40))
    setImageScale(1 + progress * 0.06)
    setImageOpacity(progress > 0.9 ? 1 - (progress - 0.9) * 10 : 1)
  }, [prefersReducedMotion, isMobile])

  useEffect(() => {
    if (prefersReducedMotion || isMobile) return
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [handleScroll, prefersReducedMotion, isMobile])

  const currentScene = scenes[activeScene] ?? scenes[0]
  const accentColor  = currentScene?.accentColor ?? '#2997ff'

  // ── Mobile layout ─────────────────────────────────────────────────────────
  if (isMobile || prefersReducedMotion) {
    return (
      <div style={{ background: backgroundColor, color: textColor, padding: '4rem 1.5rem' }}>
        {/* Product image */}
        {stickyProductImageUrl && (
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <img
              src={stickyProductImageUrl}
              alt={headline}
              style={{ maxWidth: '80%', maxHeight: 320, objectFit: 'contain', borderRadius: '1rem' }}
            />
          </div>
        )}
        {/* Scenes stacked */}
        {scenes.map((scene, i) => (
          <div key={i} style={{ marginBottom: '3rem', textAlign: 'center' }}>
            <h3 style={{ fontSize: 'clamp(1.5rem, 4vw, 2rem)', fontWeight: 700, color: textColor, margin: '0 0 1rem' }}>
              {scene.headline}
            </h3>
            <p style={{ fontSize: '1.0625rem', color: `${textColor}cc`, lineHeight: 1.65, margin: 0 }}>
              {scene.description}
            </p>
          </div>
        ))}
      </div>
    )
  }

  // ── Desktop sticky layout ──────────────────────────────────────────────────
  return (
    <div
      ref={stageRef}
      style={{
        background:    backgroundColor,
        color:         textColor,
        position:      'relative',
        minHeight:     `${scenes.length * 100}vh`,
      }}
    >
      {/* Sticky product stage */}
      <div style={{
        position:   'sticky',
        top:        0,
        height:     '100vh',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex:     1,
        pointerEvents: 'none',
        overflow:   'hidden',
      }}>
        {/* Product visual */}
        <div
          style={{
            position:  'absolute',
            left:      '50%',
            top:       '50%',
            transform: `translate(-50%, calc(-50% + ${imageTranslateY}px)) scale(${imageScale})`,
            opacity:   imageOpacity,
            transition: hasScrolled ? 'transform 0.12s ease-out, opacity 0.2s ease-out' : 'none',
            maxWidth:  '50vw',
            maxHeight: '70vh',
          }}
        >
          {stickyProductImageUrl
            ? (
              <img
                src={stickyProductImageUrl}
                alt={headline}
                style={{
                  maxWidth: '100%',
                  maxHeight: '70vh',
                  objectFit: 'contain',
                  display: 'block',
                  filter: 'drop-shadow(0 20px 80px rgba(0,0,0,0.6))',
                }}
              />
            )
            : (
              // Placeholder product stage when no image
              <div style={{
                width:        280,
                height:       280,
                borderRadius: '50%',
                background:   `radial-gradient(circle at 30% 30%, ${accentColor}44 0%, transparent 60%), radial-gradient(circle, #1d1d1f 100%)`,
                border:       `2px solid ${accentColor}33`,
                display:      'flex',
                alignItems:   'center',
                justifyContent: 'center',
                fontSize:     '5rem',
              }}>
                ◉
              </div>
            )
          }
        </div>

        {/* Text scene overlay */}
        <div style={{
          position:     'absolute',
          right:        '8%',
          top:          '50%',
          transform:    'translateY(-50%)',
          maxWidth:     380,
          padding:      '2.5rem',
          background:   'rgba(0,0,0,0.65)',
          backdropFilter: 'blur(16px)',
          borderRadius: '1.5rem',
          border:       `1px solid ${accentColor}33`,
          transition:   'opacity 0.3s ease',
          pointerEvents: 'all',
        }}>
          <div style={{
            width:        40,
            height:       3,
            background:   accentColor,
            borderRadius: 2,
            marginBottom: '1.25rem',
            transition:   'background 0.3s ease',
          }} />
          <h2 style={{
            fontSize:    'clamp(1.5rem, 2.5vw, 2rem)',
            fontWeight:  700,
            lineHeight:  1.2,
            color:       textColor,
            margin:      '0 0 1rem',
            transition:  'opacity 0.3s ease',
          }}>
            {currentScene?.headline}
          </h2>
          <p style={{
            fontSize:   '1.0625rem',
            color:      `${textColor}cc`,
            lineHeight: 1.65,
            margin:     0,
          }}>
            {currentScene?.description}
          </p>
          {/* Scene indicators */}
          <div style={{ display: 'flex', gap: 8, marginTop: '1.5rem' }}>
            {scenes.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveScene(i)}
                aria-label={`Scene ${i + 1}`}
                style={{
                  width:        i === activeScene ? 24 : 8,
                  height:       8,
                  borderRadius: 4,
                  background:   i === activeScene ? accentColor : `${textColor}44`,
                  border:       'none',
                  cursor:       'pointer',
                  padding:      0,
                  transition:   'all 0.3s ease',
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Scrollable scene panels (invisible, drive scroll position) */}
      {scenes.map((scene, i) => (
        <div
          key={i}
          ref={(el) => { sceneRefs.current[i] = el }}
          style={{
            height:        '100vh',
            display:       'flex',
            alignItems:    'center',
            justifyContent: 'flex-start',
            padding:       '0 8%',
            position:      'relative',
            zIndex:        2,
          }}
          aria-label={scene.headline}
        />
      ))}

      {/* 360 viewer placeholder (non-blocking) */}
      {use360IfAvailable && featuredProductId && (
        <div style={{ display: 'none' }} data-product-360={featuredProductId} />
      )}
    </div>
  )
}
