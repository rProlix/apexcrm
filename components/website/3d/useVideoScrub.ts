'use client'

// components/website/3d/useVideoScrub.ts
// Scroll-scrubs an HTMLVideoElement: maps a 0..1 progress ref to video
// currentTime with RAF smoothing and Safari/iOS guardrails. Scrolling down
// advances the video; scrolling up seeks it backward. No audio, no autoplay.
//
// The video element is owned by the caller (so it can render poster/fit/etc.);
// this hook only drives time + reports ready/errored state.

import { useEffect, useRef, useState } from 'react'

interface UseVideoScrubOptions {
  videoRef:    React.RefObject<HTMLVideoElement | null>
  progressRef: React.RefObject<number>
  active:      boolean
  /** 0 (snappy) .. 1 (very smooth) */
  smoothing?:  number
  /** Optional clip window in seconds */
  startTime?:  number
  endTime?:    number
}

export function useVideoScrub({
  videoRef, progressRef, active, smoothing = 0.12, startTime, endTime,
}: UseVideoScrubOptions): { ready: boolean; errored: boolean } {
  const [ready, setReady] = useState(false)
  const [errored, setErrored] = useState(false)
  const durationRef = useRef(0)
  const lastSetRef = useRef(-1)

  // Wait for metadata so we know the duration before scrubbing.
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    const onLoaded = () => {
      durationRef.current = Number.isFinite(v.duration) ? v.duration : 0
      setReady(true)
    }
    const onError = () => setErrored(true)

    v.addEventListener('loadedmetadata', onLoaded)
    v.addEventListener('error', onError)
    if (v.readyState >= 1) onLoaded()

    return () => {
      v.removeEventListener('loadedmetadata', onLoaded)
      v.removeEventListener('error', onError)
    }
  }, [videoRef])

  // Scrub loop — drives currentTime from scroll progress.
  useEffect(() => {
    if (!ready || errored || !active) return
    const v = videoRef.current
    if (!v) return

    let rafId = 0
    const clampSmoothing = Math.min(0.98, Math.max(0, smoothing))
    const lerpFactor = 1 - clampSmoothing * 0.9

    const fullDuration = durationRef.current
    const lo = Math.max(0, Math.min(fullDuration, startTime ?? 0))
    const hi = endTime != null ? Math.max(lo, Math.min(fullDuration, endTime)) : fullDuration
    const window = Math.max(0, hi - lo)

    let smooth = lastSetRef.current >= 0 ? lastSetRef.current : lo

    const loop = () => {
      if (window > 0) {
        const p = Math.min(1, Math.max(0, progressRef.current ?? 0))
        const target = lo + p * window
        smooth += (target - smooth) * lerpFactor
        const clamped = Math.min(hi - 0.05, Math.max(lo, smooth))
        // Safari/iOS guardrail: skip while a seek is pending; ignore tiny deltas.
        if (!v.seeking && Math.abs(clamped - lastSetRef.current) > 0.02) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const anyV = v as any
            if (typeof anyV.fastSeek === 'function') anyV.fastSeek(clamped)
            else v.currentTime = clamped
            lastSetRef.current = clamped
          } catch { /* ignore transient seek errors */ }
        }
      }
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)
    return () => { if (rafId) cancelAnimationFrame(rafId) }
  }, [ready, errored, active, smoothing, startTime, endTime, videoRef, progressRef])

  return { ready, errored }
}
