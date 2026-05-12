'use client'
// components/site/AnimatedElement.tsx
//
// Client component for applying Framer Motion animations to individual
// website elements (headings, buttons, cards, images, etc.).
//
// Usage:
//   <AnimatedElement animConfig={componentAnimations?.heading} as="h1">
//     {headlineText}
//   </AnimatedElement>
//
// - If animConfig is null/undefined → renders children in a plain wrapper (no DOM penalty)
// - Respects prefers-reduced-motion automatically via Framer Motion's useReducedMotion
// - All presets are safe CSS-only variants (no layout shift, no invalid HTML)
// - Fail-safe: any error falls back to plain rendering

import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { Variants, Transition } from 'framer-motion'

export interface ComponentAnimConfig {
  preset?:        string
  intensity?:     'subtle' | 'balanced' | 'cinematic'
  durationMs?:    number
  delayMs?:       number
  staggerMs?:     number
  easing?:        string
  mobileEnabled?: boolean
  disabled?:      boolean
}

type ElementTag = 'div' | 'span' | 'p' | 'h1' | 'h2' | 'h3' | 'h4' | 'section' | 'article' | 'li'

interface Props {
  children:    React.ReactNode
  animConfig?: ComponentAnimConfig | null
  as?:         ElementTag
  className?:  string
  style?:      React.CSSProperties
  /** Extra index for stagger-aware parents */
  index?:      number
}

// ── Variant map — all presets ──────────────────────────────────────────────────

type VariantPair = { hidden: Variants['hidden']; visible: Variants['visible'] }

const VARIANTS: Record<string, VariantPair> = {
  fade_in:      { hidden: { opacity: 0 },               visible: { opacity: 1 } },
  fade_up:      { hidden: { opacity: 0, y: 24 },        visible: { opacity: 1, y: 0 } },
  text_reveal:  { hidden: { opacity: 0, y: 16 },        visible: { opacity: 1, y: 0 } },
  slide_up:     { hidden: { opacity: 0, y: 32 },        visible: { opacity: 1, y: 0 } },
  slide_left:   { hidden: { opacity: 0, x: 32 },        visible: { opacity: 1, x: 0 } },
  slide_right:  { hidden: { opacity: 0, x: -32 },       visible: { opacity: 1, x: 0 } },
  scale_in:     { hidden: { opacity: 0, scale: 0.88 },  visible: { opacity: 1, scale: 1 } },
  blur_reveal:  { hidden: { opacity: 0, filter: 'blur(10px)' }, visible: { opacity: 1, filter: 'blur(0px)' } },
  card_lift:    { hidden: { opacity: 0, y: 20, scale: 0.97 },   visible: { opacity: 1, y: 0, scale: 1 } },
  image_float:  { hidden: { opacity: 0, scale: 1.06 },  visible: { opacity: 1, scale: 1 } },
  image_zoom:   { hidden: { opacity: 0, scale: 1.08 },  visible: { opacity: 1, scale: 1 } },
  luxury_reveal:{ hidden: { opacity: 0, y: 20, scale: 0.98 },   visible: { opacity: 1, y: 0, scale: 1 } },
  premium_float:{ hidden: { opacity: 0, y: 30 },        visible: { opacity: 1, y: 0 } },
  hero_cinematic:{ hidden: { opacity: 0, scale: 1.08 }, visible: { opacity: 1, scale: 1 } },
  magnetic_button:{ hidden: { opacity: 0, scale: 0.92 },visible: { opacity: 1, scale: 1 } },
  section_glow: { hidden: { opacity: 0 },               visible: { opacity: 1 } },
  // stagger_children: parent controls; children inherit
  stagger_children: { hidden: { opacity: 0, y: 16 },    visible: { opacity: 1, y: 0 } },
  soft_parallax:    { hidden: { opacity: 0, y: 28 },    visible: { opacity: 1, y: 0 } },
  product_card_reveal: { hidden: { opacity: 0, y: 24, scale: 0.96 }, visible: { opacity: 1, y: 0, scale: 1 } },
  testimonial_carousel_reveal: { hidden: { opacity: 0, x: 30 }, visible: { opacity: 1, x: 0 } },
}

// ── Easing map ────────────────────────────────────────────────────────────────

const EASING_MAP: Record<string, string | number[]> = {
  standard:  [0.25, 0.46, 0.45, 0.94],
  smooth:    [0.16, 1, 0.3, 1],
  luxury:    [0.6, 0.05, -0.01, 0.9],
  spring:    [0.34, 1.56, 0.64, 1],
  ease_out:  [0.0, 0.0, 0.2, 1],
  linear:    'linear',
}

// ── Intensity tweaks ──────────────────────────────────────────────────────────

const INTENSITY_SCALE: Record<string, number> = {
  subtle:   0.6,
  balanced: 1.0,
  cinematic: 1.4,
}

// ── Intensity normalizer (mirrors server-side normalizeAnimationIntensity) ─────
// Ensures saved configs with "high"/"medium"/"bold" etc. render correctly
// without crashing, even if old data predates the normalization pipeline.
function safeIntensity(
  raw: string | undefined | null,
): 'subtle' | 'balanced' | 'cinematic' {
  const v = String(raw ?? '').toLowerCase().trim()
  if (['low', 'light', 'soft', 'minimal', 'gentle', 'subtle', 'quiet'].includes(v)) return 'subtle'
  if (['high', 'strong', 'bold', 'dramatic', 'premium', 'luxury',
       'cinematic', 'expensive', 'ultra', 'intense', 'maximum', 'max'].includes(v)) return 'cinematic'
  if (['medium', 'moderate', 'normal', 'standard', 'balanced',
       'default', 'mid', 'middle', 'regular', 'average'].includes(v)) return 'balanced'
  if (v === 'subtle' || v === 'balanced' || v === 'cinematic')
    return v as 'subtle' | 'balanced' | 'cinematic'
  return 'balanced'
}

export function AnimatedElement({
  children,
  animConfig,
  as = 'div',
  className,
  style,
  index = 0,
}: Props) {
  const shouldReduceMotion = useReducedMotion()

  // No animation: render plain element
  if (!animConfig || animConfig.disabled || shouldReduceMotion) {
    const Tag = as as React.ElementType
    return <Tag className={className} style={style}>{children}</Tag>
  }

  const preset     = animConfig.preset ?? 'fade_up'
  const variant    = VARIANTS[preset] ?? VARIANTS.fade_up
  const normalizedIntensity = safeIntensity(animConfig.intensity)
  const scale      = INTENSITY_SCALE[normalizedIntensity] ?? 1
  const duration = ((animConfig.durationMs ?? 600) * scale) / 1000
  const delay    = ((animConfig.delayMs ?? 0) + index * (animConfig.staggerMs ?? 0)) / 1000
  const easing   = EASING_MAP[animConfig.easing ?? 'smooth'] ?? EASING_MAP.smooth

  const transition: Transition = {
    duration,
    delay,
    ease: easing as never,
  }

  const MotionTag = motion[as as keyof typeof motion] as typeof motion.div ?? motion.div

  return (
    <MotionTag
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={{ hidden: variant.hidden, visible: variant.visible }}
      transition={transition}
      className={className}
      style={style}
    >
      {children}
    </MotionTag>
  )
}
