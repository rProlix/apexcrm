'use client'

// components/website/3d/useLenisScroll.ts
// Initializes Lenis smooth-scroll on the client only, and integrates it with
// GSAP's ScrollTrigger when present. Fully cleans up its RAF loop + instance.
//
// Disabled automatically when `enabled` is false or reduced motion is on.

import { useEffect, useRef } from 'react'
import type Lenis from 'lenis'

interface Options {
  enabled?: boolean
}

export function useLenisScroll({ enabled = true }: Options = {}): React.RefObject<Lenis | null> {
  const lenisRef = useRef<Lenis | null>(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return

    let rafId = 0
    let cancelled = false
    let cleanupFns: Array<() => void> = []

    // Dynamically import so Lenis never lands in the server bundle.
    void (async () => {
      try {
        const [{ default: LenisCtor }, gsapMod] = await Promise.all([
          import('lenis'),
          import('gsap/ScrollTrigger').catch(() => null),
        ])
        if (cancelled) return

        const lenis = new LenisCtor({
          duration: 1.1,
          smoothWheel: true,
        })
        lenisRef.current = lenis

        const ScrollTrigger = gsapMod?.ScrollTrigger
        if (ScrollTrigger) {
          const onScroll = () => ScrollTrigger.update()
          lenis.on('scroll', onScroll)
          cleanupFns.push(() => lenis.off('scroll', onScroll))
        }

        const raf = (time: number) => {
          lenis.raf(time)
          rafId = requestAnimationFrame(raf)
        }
        rafId = requestAnimationFrame(raf)
      } catch {
        // Lenis is optional — failing to load it just means native scrolling.
      }
    })()

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      cleanupFns.forEach((fn) => {
        try { fn() } catch { /* noop */ }
      })
      cleanupFns = []
      try { lenisRef.current?.destroy() } catch { /* noop */ }
      lenisRef.current = null
    }
  }, [enabled])

  return lenisRef
}
