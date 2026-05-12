'use client'
// components/website/animations/AnimatedSection.tsx
// Lightweight client component that wraps a website section with Framer Motion
// animation based on the section's animation_config from the DB.
//
// Architecture:
//  - Server components pass a serialized animationConfig prop
//  - This component is client-only; it reads the config and applies presets
//  - If config is missing, null, or invalid, children render without animation
//  - Always respects prefers-reduced-motion
//  - Uses Framer Motion viewport detection for below-the-fold triggering

import React from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { getAnimationVariants, STYLE_PRESET_CLASSES } from '@/lib/website/animations/presets'
import type { ValidatedSectionAnimationConfig } from '@/lib/website/animations/validateAnimationConfig'
import type { AnimationPreset } from '@/lib/website/animations/types'

interface Props {
  children:        React.ReactNode
  animationConfig: ValidatedSectionAnimationConfig | null
  className?:      string
  /** Tag to render. Default 'div' wraps the section component without double-nesting. */
  as?:             'div' | 'section' | 'article'
}

export function AnimatedSection({
  children,
  animationConfig,
  className = '',
  as = 'div',
}: Props) {
  const prefersReduced = useReducedMotion()

  // If no config or disabled, render children unwrapped
  if (!animationConfig || !animationConfig.enabled) {
    return <>{children}</>
  }

  const { animation, style } = animationConfig

  // Style preset class
  const presetClass = style?.stylePreset
    ? (STYLE_PRESET_CLASSES[style.stylePreset] ?? '')
    : ''

  const combinedClass = [presetClass, className].filter(Boolean).join(' ')

  // Respect prefers-reduced-motion — keep style classes but skip motion
  if (prefersReduced || animation?.disabled) {
    const Tag = as
    return <Tag className={combinedClass || undefined}>{children}</Tag>
  }

  const mobileEnabled = animation?.mobileEnabled !== false
  const preset        = (animation?.preset ?? 'fade_up') as AnimationPreset
  const durationMs    = animation?.durationMs ?? 600
  const delayMs       = animation?.delayMs ?? 0
  const easing        = animation?.easing ?? 'smooth'

  const variants = getAnimationVariants(preset, easing, durationMs, delayMs)

  // Use the requested tag as the motion element
  const MotionTag = as === 'section' ? motion.section
    : as === 'article'                ? motion.article
    :                                   motion.div

  return (
    <MotionTag
      className={combinedClass || undefined}
      data-animation-preset={preset}
      data-mobile-enabled={mobileEnabled ? 'true' : 'false'}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-10% 0px' }}
      variants={variants}
    >
      {children}
    </MotionTag>
  )
}

// ── Stagger container for card grids ────────────────────────────────────────

interface StaggerContainerProps {
  children:        React.ReactNode
  staggerMs?:      number
  durationMs?:     number
  easing?:         string
  className?:      string
}

export function StaggerContainer({
  children,
  staggerMs = 80,
  durationMs = 500,
  easing = 'smooth',
  className = '',
}: StaggerContainerProps) {
  const prefersReduced = useReducedMotion()

  if (prefersReduced) {
    return <div className={className}>{children}</div>
  }

  const staggerSec = staggerMs / 1000
  const durSec     = durationMs / 1000

  const containerVariants = {
    hidden:  {},
    visible: { transition: { staggerChildren: staggerSec } },
  }
  const itemVariants = {
    hidden:  { opacity: 0, y: 16, scale: 0.97 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: durSec } },
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-8% 0px' }}
      variants={containerVariants}
    >
      {React.Children.map(children, child => (
        <motion.div variants={itemVariants}>{child}</motion.div>
      ))}
    </motion.div>
  )
}
