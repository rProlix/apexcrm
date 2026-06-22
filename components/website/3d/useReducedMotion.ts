'use client'

// components/website/3d/useReducedMotion.ts
// Returns true when the user has requested reduced motion.
// SSR-safe: defaults to false on the server, updates after mount.

import { useEffect, useState } from 'react'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(mq.matches)
    update()
    // addEventListener is the modern API; fall back for older Safari
    if (mq.addEventListener) {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    mq.addListener(update)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return () => mq.removeListener(update)
  }, [])

  return reduced
}

/** Returns true on small/coarse-pointer (mobile) viewports. SSR-safe. */
export function useIsMobile(maxWidth = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia(`(max-width: ${maxWidth}px), (pointer: coarse)`)
    const update = () => setIsMobile(mq.matches)
    update()
    if (mq.addEventListener) {
      mq.addEventListener('change', update)
      return () => mq.removeEventListener('change', update)
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    mq.addListener(update)
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    return () => mq.removeListener(update)
  }, [maxWidth])

  return isMobile
}
