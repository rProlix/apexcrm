'use client'

// components/website/3d/VideoScrubScene.tsx
// Scroll-scrubbed H.264 MP4 video. Maps scroll progress (0..1) to
// video.currentTime. No audio, no autoplay-with-sound. Designed to behave on
// Safari/iOS where seeking is async and can be choppy.
//
// If the video fails to decode/load, a fallback image (or poster) is shown.

import { useEffect, useRef, useState } from 'react'
import type { Premium3DScrollHeroContent } from '@/lib/website/premium3d/types'

interface Props {
  content:     Premium3DScrollHeroContent
  progressRef: React.RefObject<number>
  active:      boolean
}

export default function VideoScrubScene({ content, progressRef, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [ready, setReady] = useState(false)
  const [errored, setErrored] = useState(false)
  const durationRef = useRef(0)
  const lastSetRef = useRef(-1)

  const objectFit = content.videoObjectFit === 'contain' ? 'contain' : 'cover'
  const poster = content.posterUrl ?? content.fallbackImageUrl ?? undefined

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
    // If already loaded (cached), fire immediately
    if (v.readyState >= 1) onLoaded()

    return () => {
      v.removeEventListener('loadedmetadata', onLoaded)
      v.removeEventListener('error', onError)
    }
  }, [])

  // Scrub loop — drives currentTime from scroll progress.
  useEffect(() => {
    if (!ready || errored || !active) return
    const v = videoRef.current
    if (!v) return

    let rafId = 0
    let smooth = lastSetRef.current >= 0 ? lastSetRef.current : 0
    const smoothing = Math.min(0.98, Math.max(0, content.scrubSmoothing ?? 0.12))
    const lerpFactor = 1 - smoothing * 0.9

    const loop = () => {
      const duration = durationRef.current
      if (duration > 0) {
        const p = Math.min(1, Math.max(0, progressRef.current ?? 0))
        const target = p * duration
        smooth += (target - smooth) * lerpFactor
        const clamped = Math.min(duration - 0.05, Math.max(0, smooth))
        // Safari/iOS guardrail: don't issue a new seek while one is pending,
        // and ignore tiny deltas to avoid jitter.
        if (!v.seeking && Math.abs(clamped - (lastSetRef.current)) > 0.02) {
          try {
            // fastSeek is cheaper on Safari when available
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
  }, [ready, errored, active, content.scrubSmoothing, progressRef])

  if (errored) {
    const src = content.fallbackImageUrl ?? content.posterUrl
    return (
      <div style={{ width: '100%', height: '100%' }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={content.headline} style={{ width: '100%', height: '100%', objectFit }} />
        ) : null}
      </div>
    )
  }

  return (
    <video
      ref={videoRef}
      src={content.videoUrl ?? undefined}
      poster={poster}
      muted
      playsInline
      preload="metadata"
      // never autoplay with sound; we drive frames manually
      controls={false}
      disablePictureInPicture
      style={{ width: '100%', height: '100%', objectFit, display: 'block' }}
    >
      {content.videoUrl ? <source src={content.videoUrl} type="video/mp4" /> : null}
    </video>
  )
}
