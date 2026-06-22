'use client'

// components/website/3d/useScrollProgress.ts
// Drives a 0..1 scroll progress value for the hero, optionally pinning the
// visual while the section scrubs. Uses GSAP ScrollTrigger on the client only.
//
// Design notes:
//  - The smoothed progress is exposed via a ref (progressRef.current) so scenes
//    can read it inside their own requestAnimationFrame loops WITHOUT causing
//    React re-renders every frame.
//  - visibleRef tracks whether the section is currently active, so scenes can
//    pause expensive rendering when off-screen.
//  - Everything is torn down on unmount: ScrollTrigger instance is killed and
//    the RAF smoothing loop is cancelled (no leaks).

import { useEffect, useRef } from 'react'

interface Options {
  triggerRef:   React.RefObject<HTMLElement | null>
  pinRef?:      React.RefObject<HTMLElement | null>
  /** Multiple of viewport height to scrub across (>=1) */
  scrollLength?: number
  pin?:          boolean
  /** 0 (snappy) .. 1 (very smooth) */
  smoothing?:    number
  enabled?:      boolean
  onVisibilityChange?: (visible: boolean) => void
}

export interface ScrollProgressHandles {
  progressRef: React.RefObject<number>
  visibleRef:  React.RefObject<boolean>
}

export function useScrollProgress({
  triggerRef,
  pinRef,
  scrollLength = 2.5,
  pin = true,
  smoothing = 0.12,
  enabled = true,
  onVisibilityChange,
}: Options): ScrollProgressHandles {
  const progressRef = useRef(0)   // smoothed value scenes read
  const rawRef       = useRef(0)   // latest raw scroll progress
  const visibleRef   = useRef(false)

  useEffect(() => {
    if (!enabled) {
      progressRef.current = 0
      rawRef.current = 0
      return
    }
    if (typeof window === 'undefined') return
    const trigger = triggerRef.current
    if (!trigger) return

    let cancelled = false
    let rafId = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let stInstance: any = null
    let refreshTimeout: ReturnType<typeof setTimeout> | null = null

    void (async () => {
      try {
        const gsapMod = await import('gsap')
        const stMod   = await import('gsap/ScrollTrigger')
        if (cancelled) return
        const gsap = gsapMod.gsap ?? gsapMod.default
        const ScrollTrigger = stMod.ScrollTrigger
        gsap.registerPlugin(ScrollTrigger)

        const lerpFactor = 1 - Math.min(0.98, Math.max(0, smoothing)) * 0.92

        stInstance = ScrollTrigger.create({
          trigger,
          start: 'top top',
          end:   `+=${Math.max(1, scrollLength) * 100}%`,
          pin:   pin ? (pinRef?.current ?? true) : false,
          pinSpacing: pin,
          scrub: true,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onUpdate: (self: any) => { rawRef.current = self.progress },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onToggle: (self: any) => {
            visibleRef.current = self.isActive
            onVisibilityChange?.(self.isActive)
          },
        })

        // Smooth toward the raw value every frame.
        const loop = () => {
          progressRef.current += (rawRef.current - progressRef.current) * lerpFactor
          rafId = requestAnimationFrame(loop)
        }
        rafId = requestAnimationFrame(loop)

        // Layout can shift after fonts/images load — refresh once settled.
        refreshTimeout = setTimeout(() => {
          try { ScrollTrigger.refresh() } catch { /* noop */ }
        }, 300)
      } catch {
        // GSAP failed to load — leave progress at 0 (fallback rendering handles it)
      }
    })()

    return () => {
      cancelled = true
      if (rafId) cancelAnimationFrame(rafId)
      if (refreshTimeout) clearTimeout(refreshTimeout)
      try { stInstance?.kill() } catch { /* noop */ }
      stInstance = null
    }
  }, [triggerRef, pinRef, scrollLength, pin, smoothing, enabled, onVisibilityChange])

  return { progressRef, visibleRef }
}
