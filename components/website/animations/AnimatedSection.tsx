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
  as?:             'section' | 'div' | 'article'
}

export function AnimatedSection({
  children,
  animationConfig,
  className = '',
  as = 'section',
}: Props) {
  const prefersReduced = useReducedMotion()

  // If no config, just render children normally
  if (!animationConfig || !animationConfig.enabled) {
    const Tag = as
    return <Tag className={className}>{children}</Tag>
  }

  const { animation, style } = animationConfig

  // Style preset class
  const presetClass = style?.stylePreset
    ? (STYLE_PRESET_CLASSES[style.stylePreset] ?? '')
    : ''

  const combinedClass = [presetClass, className].filter(Boolean).join(' ')

  // If reduced motion is preferred, just apply style classes but no animation
  if (prefersReduced || animation?.disabled) {
    const Tag = as
    return <Tag className={combinedClass}>{children}</Tag>
  }

  // Check mobile: if mobileEnabled is false, skip animation on small screens
  // We use CSS approach via data attribute; JS check would cause hydration issues
  const mobileEnabled = animation?.mobileEnabled !== false

  const preset     = (animation?.preset ?? 'fade_up') as AnimationPreset
  const durationMs = animation?.durationMs ?? 600
  const delayMs    = animation?.delayMs ?? 0
  const easing     = animation?.easing ?? 'smooth'

  const variants = getAnimationVariants(preset, easing, durationMs, delayMs)

  return (
    <motion.section
      className={combinedClass}
      data-animation-preset={preset}
      data-mobile-enabled={mobileEnabled ? 'true' : 'false'}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-10% 0px' }}
      variants={variants}
    >
      {children}
    </motion.section>
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
