'use client'
// components/website/animations/useReducedMotionSafe.ts
// Wraps Framer Motion's useReducedMotion with a safe SSR fallback.
// Always reduces motion when the system preference is set.

import { useReducedMotion } from 'framer-motion'

/**
 * Returns true when the user has requested reduced motion.
 * Always returns false during SSR (safe for hydration).
 */
export function useReducedMotionSafe(): boolean {
  const prefersReduced = useReducedMotion()
  return !!prefersReduced
}
