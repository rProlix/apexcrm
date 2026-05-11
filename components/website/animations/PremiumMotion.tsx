'use client'
// components/website/animations/PremiumMotion.tsx
// Small motion utility components for use inside section components.
// Only use inside 'use client' boundaries.

import { motion, useReducedMotion } from 'framer-motion'
import type { ReactNode } from 'react'

interface FadeUpProps {
  children:   ReactNode
  delay?:     number
  duration?:  number
  className?: string
}

/** Fade up with viewport trigger. */
export function FadeUp({ children, delay = 0, duration = 0.55, className }: FadeUpProps) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Fade in without movement. */
export function FadeIn({ children, delay = 0, duration = 0.45, className }: FadeUpProps) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration, delay, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}

/** Premium card hover lift. */
export function PremiumCard({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      whileHover={{ y: -4, scale: 1.01, boxShadow: '0 20px 40px -12px rgba(0,0,0,0.25)' }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}

/** Glass card hover effect. */
export function GlassCard({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  if (reduced) return <div className={className}>{children}</div>
  return (
    <motion.div
      className={className}
      whileHover={{
        backdropFilter: 'blur(12px)',
        borderColor:    'rgba(255,255,255,0.3)',
        y: -2,
      }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

/** Spotlight sweep shimmer on hover (CSS-powered, no JS). */
export function SpotlightCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden group ${className ?? ''}`}
      style={{ isolation: 'isolate' }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: 'radial-gradient(600px at 0% 0%, rgba(120,80,255,0.08), transparent 70%)',
        }}
      />
      {children}
    </div>
  )
}
