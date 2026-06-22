'use client'

// components/website/3d/ImageSequenceScrubScene.tsx
// Frame-perfect scroll scrubbing using an image sequence. Maps scroll progress
// (0..1) to a frame index and swaps the displayed frame directly on the DOM
// (no per-frame React re-render). Only nearby frames are preloaded unless the
// sequence is small. Best for construction progress + cinematic transitions.

import { useEffect, useRef, useState } from 'react'
import type { Premium3DScrollHeroContent } from '@/lib/website/premium3d/types'

interface Props {
  content:     Premium3DScrollHeroContent
  progressRef: React.RefObject<number>
  active:      boolean
}

const SMALL_SEQUENCE = 24      // preload everything if <= this many frames
const PRELOAD_WINDOW = 4       // frames to preload on each side otherwise

export default function ImageSequenceScrubScene({ content, progressRef, active }: Props) {
  const frames = content.imageSequenceUrls ?? []
  const imgRef = useRef<HTMLImageElement>(null)
  const cacheRef = useRef<Map<number, HTMLImageElement>>(new Map())
  const lastIndexRef = useRef(-1)
  const [errored, setErrored] = useState(false)
  const objectFit = content.videoObjectFit === 'contain' ? 'contain' : 'cover'

  useEffect(() => {
    if (frames.length === 0) return
    const cache = cacheRef.current

    const preload = (index: number) => {
      if (index < 0 || index >= frames.length || cache.has(index)) return
      const img = new Image()
      img.src = frames[index]
      cache.set(index, img)
    }

    // Small sequences: preload everything up front.
    if (frames.length <= SMALL_SEQUENCE) {
      frames.forEach((_, i) => preload(i))
    } else {
      preload(0)
    }

    let rafId = 0
    const loop = () => {
      if (active) {
        const p = Math.min(1, Math.max(0, progressRef.current ?? 0))
        const index = Math.min(frames.length - 1, Math.round(p * (frames.length - 1)))
        if (index !== lastIndexRef.current) {
          // Preload a window around the active frame for larger sequences.
          if (frames.length > SMALL_SEQUENCE) {
            for (let d = -PRELOAD_WINDOW; d <= PRELOAD_WINDOW; d++) preload(index + d)
          }
          const cached = cache.get(index)
          const el = imgRef.current
          if (el) {
            el.src = cached?.src ?? frames[index]
          }
          lastIndexRef.current = index
        }
      }
      rafId = requestAnimationFrame(loop)
    }
    rafId = requestAnimationFrame(loop)

    return () => {
      if (rafId) cancelAnimationFrame(rafId)
      cache.clear()
      lastIndexRef.current = -1
    }
  }, [frames, active, progressRef])

  if (errored || frames.length === 0) {
    const src = content.fallbackImageUrl ?? content.posterUrl
    return src ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={content.headline} style={{ width: '100%', height: '100%', objectFit }} />
    ) : null
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={content.posterUrl ?? frames[0]}
      alt={content.headline}
      onError={() => setErrored(true)}
      style={{ width: '100%', height: '100%', objectFit, display: 'block' }}
    />
  )
}
