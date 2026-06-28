'use client'
// components/website/canva/AnimatedReveal.tsx
// Recreates the FEEL of Canva motion using NexoraNow animation presets via
// framer-motion whileInView. Used by the converted-PDF public renderer.

import { motion, type Variants } from 'framer-motion'
import type { NexoraAnimationPreset } from '@/lib/website/canva/pdf-animation-recreator'

interface Props {
  preset: NexoraAnimationPreset
  delay?: number
  duration?: number
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
}

function variantsFor(preset: NexoraAnimationPreset, duration: number, delay: number): Variants {
  const t = { duration, delay, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }
  switch (preset) {
    case 'fadeIn':            return { hidden: { opacity: 0 }, show: { opacity: 1, transition: t } }
    case 'fadeUp':            return { hidden: { opacity: 0, y: 40 }, show: { opacity: 1, y: 0, transition: t } }
    case 'slideInLeft':       return { hidden: { opacity: 0, x: -60 }, show: { opacity: 1, x: 0, transition: t } }
    case 'slideInRight':      return { hidden: { opacity: 0, x: 60 }, show: { opacity: 1, x: 0, transition: t } }
    case 'zoomIn':            return { hidden: { opacity: 0, scale: 0.9 }, show: { opacity: 1, scale: 1, transition: t } }
    case 'softParallax':      return { hidden: { opacity: 0, y: 60 }, show: { opacity: 1, y: 0, transition: { ...t, duration: duration * 1.3 } } }
    case 'imageReveal':       return { hidden: { opacity: 0, clipPath: 'inset(12% 12% 12% 12%)' }, show: { opacity: 1, clipPath: 'inset(0% 0% 0% 0%)', transition: { ...t, duration: duration * 1.2 } } }
    case 'maskReveal':        return { hidden: { opacity: 0, clipPath: 'inset(0 100% 0 0)' }, show: { opacity: 1, clipPath: 'inset(0 0% 0 0)', transition: { ...t, duration: duration * 1.2 } } }
    case 'premiumBlurReveal': return { hidden: { opacity: 0, filter: 'blur(14px)', scale: 1.03 }, show: { opacity: 1, filter: 'blur(0px)', scale: 1, transition: { ...t, duration: duration * 1.3 } } }
    case 'floating':          return { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: t } }
    case 'subtleRotate':      return { hidden: { opacity: 0, rotate: -2, scale: 0.98 }, show: { opacity: 1, rotate: 0, scale: 1, transition: t } }
    case 'staggerText':       return { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: t } }
    case 'none':
    default:                  return { hidden: { opacity: 1 }, show: { opacity: 1 } }
  }
}

export function AnimatedReveal({ preset, delay = 0, duration = 0.7, children, className, style }: Props) {
  if (preset === 'none') return <div className={className} style={style}>{children}</div>
  return (
    <motion.div
      className={className}
      style={style}
      variants={variantsFor(preset, duration, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.2 }}
    >
      {children}
    </motion.div>
  )
}
