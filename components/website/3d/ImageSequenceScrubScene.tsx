'use client'

// components/website/3d/ImageSequenceScrubScene.tsx
// Frame-perfect scroll scrubbing using an image sequence. Maps scroll progress
// (0..1) to a frame index and swaps the displayed frame directly on the DOM
// (no per-frame React re-render). Only nearby frames are preloaded unless the
// sequence is small. Best for construction progress + cinematic transitions.

import { useRef } from 'react'
import type { Premium3DScrollHeroContent } from '@/lib/website/premium3d/types'
import { useImageSequenceScrub } from './useImageSequenceScrub'

interface Props {
  content:     Premium3DScrollHeroContent
  progressRef: React.RefObject<number>
  active:      boolean
}

export default function ImageSequenceScrubScene({ content, progressRef, active }: Props) {
  const frames = content.imageSequenceUrls ?? []
  const imgRef = useRef<HTMLImageElement>(null)
  const objectFit = content.videoObjectFit === 'contain' ? 'contain' : 'cover'

  const { errored, setErrored } = useImageSequenceScrub({ frames, imgRef, progressRef, active })

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
