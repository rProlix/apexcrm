'use client'

// components/site/premium/ParallaxOnePage.tsx
// Premium parallax one-page template renderer.
// Wraps normal website sections with parallax depth, curved dividers, and reveal animations.
// Client component — handles scroll events safely.

import { useEffect, useRef, useState, type ReactNode } from 'react'

export interface ParallaxSection {
  id:         string
  sectionType: string
  children:   ReactNode
  /** Optional parallax depth (0 = no parallax, 1 = full) */
  parallaxDepth?: number
  /** Whether this section should be full-height */
  fullHeight?: boolean
}

interface Props {
  sections:        ParallaxSection[]
  backgroundColor?: string
  textColor?:       string
}

export function ParallaxOnePage({ sections, backgroundColor = '#0d0d14', textColor = '#f5f0e8' }: Props) {
  const [scrollY, setScrollY]             = useState(0)
  const [prefersReduced, setPrefersReduced] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setPrefersReduced(mq.matches)
  }, [])

  useEffect(() => {
    if (prefersReduced) return
    let ticking = false
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrollY(window.scrollY)
          ticking = false
        })
        ticking = true
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [prefersReduced])

  return (
    <div
      ref={containerRef}
      style={{ background: backgroundColor, color: textColor, overflow: 'hidden' }}
    >
      {sections.map((section, index) => (
        <ParallaxSectionWrapper
          key={section.id}
          section={section}
          index={index}
          scrollY={scrollY}
          prefersReduced={prefersReduced}
          textColor={textColor}
        />
      ))}
    </div>
  )
}

// ── Individual section wrapper with parallax ──────────────────────────────────

interface WrapperProps {
  section:       ParallaxSection
  index:         number
  scrollY:       number
  prefersReduced: boolean
  textColor:     string
}

function ParallaxSectionWrapper({ section, index, scrollY, prefersReduced, textColor }: WrapperProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [offsetTop, setOffsetTop]     = useState(0)
  const [sectionH, setSectionH]       = useState(0)
  const [isVisible, setIsVisible]     = useState(false)
  const [hasRevealed, setHasRevealed] = useState(false)

  // Measure position
  useEffect(() => {
    const measure = () => {
      if (ref.current) {
        setOffsetTop(ref.current.offsetTop)
        setSectionH(ref.current.offsetHeight)
      }
    }
    measure()
    window.addEventListener('resize', measure, { passive: true })
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Intersection observer for reveal animation
  useEffect(() => {
    if (prefersReduced) { setHasRevealed(true); return }
    if (!ref.current) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting)
        if (entry.isIntersecting) setHasRevealed(true)
      },
      { threshold: 0.15 },
    )
    obs.observe(ref.current)
    return () => obs.disconnect()
  }, [prefersReduced])

  // Parallax offset for the background layer
  const depth        = section.parallaxDepth ?? (section.sectionType === 'hero' ? 0.4 : 0.15)
  const isMobile     = typeof window !== 'undefined' && window.innerWidth < 768
  const parallaxShift = !prefersReduced && !isMobile
    ? (scrollY - offsetTop) * depth * -0.5
    : 0

  // Reveal animation
  const revealStyle: React.CSSProperties = prefersReduced
    ? {}
    : {
        opacity:   hasRevealed ? 1 : 0,
        transform: hasRevealed ? 'translateY(0)' : 'translateY(32px)',
        transition: hasRevealed || index === 0
          ? 'opacity 0.7s ease, transform 0.7s ease'
          : 'none',
      }

  // Divider between sections
  const showDivider = index > 0

  return (
    <div
      ref={ref}
      style={{
        position:  'relative',
        overflow:  'hidden',
        minHeight: section.fullHeight ? '100vh' : undefined,
      }}
      data-section-id={section.id}
      data-section-type={section.sectionType}
      aria-label={section.sectionType}
    >
      {/* Parallax background layer */}
      {depth > 0 && !prefersReduced && (
        <div
          aria-hidden="true"
          style={{
            position:  'absolute',
            inset:     '-20%',
            zIndex:    0,
            transform: `translateY(${parallaxShift}px)`,
            transition: isVisible ? 'transform 0.05s linear' : 'none',
            willChange: 'transform',
          }}
        />
      )}

      {/* Top curve divider */}
      {showDivider && (
        <SvgCurveDivider position="top" textColor={textColor} />
      )}

      {/* Section content with reveal animation */}
      <div style={{ position: 'relative', zIndex: 1, ...revealStyle }}>
        {section.children}
      </div>
    </div>
  )
}

// ── SVG curve divider ─────────────────────────────────────────────────────────

function SvgCurveDivider({ position, textColor }: { position: 'top' | 'bottom'; textColor: string }) {
  const fill = textColor === '#f5f5f7' ? '#000000' : '#f5f0e8'
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 60"
      preserveAspectRatio="none"
      style={{
        position: 'absolute',
        [position]: 0,
        left: 0,
        width: '100%',
        height: 60,
        zIndex: 2,
        transform: position === 'bottom' ? 'scaleY(-1)' : undefined,
        display: 'block',
      }}
    >
      <path d="M0,60 C480,0 960,0 1440,60 L1440,0 L0,0 Z" fill={fill} fillOpacity="0.06" />
    </svg>
  )
}
