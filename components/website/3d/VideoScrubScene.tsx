'use client'

// components/website/3d/VideoScrubScene.tsx
// Scroll-scrubbed H.264 MP4 video. Maps scroll progress (0..1) to
// video.currentTime. No audio, no autoplay-with-sound. Designed to behave on
// Safari/iOS where seeking is async and can be choppy.
//
// If the video fails to decode/load, a fallback image (or poster) is shown.

import { useRef } from 'react'
import type { Premium3DScrollHeroContent } from '@/lib/website/premium3d/types'
import { useVideoScrub } from './useVideoScrub'

interface Props {
  content:     Premium3DScrollHeroContent
  progressRef: React.RefObject<number>
  active:      boolean
}

export default function VideoScrubScene({ content, progressRef, active }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)

  const objectFit = content.videoObjectFit === 'contain' ? 'contain' : 'cover'
  const poster = content.posterUrl ?? content.fallbackImageUrl ?? undefined

  const { errored } = useVideoScrub({
    videoRef,
    progressRef,
    active,
    smoothing: content.scrubSmoothing ?? content.videoScrub?.scrubSmoothing ?? 0.12,
    startTime: content.videoScrub?.startTime ?? undefined,
    endTime:   content.videoScrub?.endTime ?? undefined,
  })

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
      preload={content.videoScrub?.preload ?? 'metadata'}
      // never autoplay with sound; we drive frames manually
      controls={false}
      disablePictureInPicture
      style={{ width: '100%', height: '100%', objectFit, display: 'block' }}
    >
      {content.videoUrl ? <source src={content.videoUrl} type="video/mp4" /> : null}
    </video>
  )
}
