'use client'

// components/website/3d/useImageSequenceScrub.ts
// Frame-perfect scroll scrubbing of an image sequence. Maps a 0..1 progress ref
// to a frame index and swaps the displayed <img> src directly on the DOM (no
// per-frame React re-render). Only nearby frames are preloaded unless the
// sequence is small. Cleans up RAF + cache on unmount.

import { useEffect, useRef, useState } from 'react'

const SMALL_SEQUENCE = 24 // preload everything if <= this many frames
const PRELOAD_WINDOW = 4  // frames to preload on each side otherwise

interface UseImageSequenceScrubOptions {
  frames:      string[]
  imgRef:      React.RefObject<HTMLImageElement | null>
  progressRef: React.RefObject<number>
  active:      boolean
}

export function useImageSequenceScrub({
  frames, imgRef, progressRef, active,
}: UseImageSequenceScrubOptions): { errored: boolean; setErrored: (v: boolean) => void } {
  const cacheRef = useRef<Map<number, HTMLImageElement>>(new Map())
  const lastIndexRef = useRef(-1)
  const [errored, setErrored] = useState(false)

  useEffect(() => {
    if (frames.length === 0) return
    const cache = cacheRef.current

    const preload = (index: number) => {
      if (index < 0 || index >= frames.length || cache.has(index)) return
      const img = new Image()
      img.src = frames[index]
      cache.set(index, img)
    }

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
          if (frames.length > SMALL_SEQUENCE) {
            for (let d = -PRELOAD_WINDOW; d <= PRELOAD_WINDOW; d++) preload(index + d)
          }
          const cached = cache.get(index)
          const el = imgRef.current
          if (el) el.src = cached?.src ?? frames[index]
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
  }, [frames, active, imgRef, progressRef])

  return { errored, setErrored }
}
