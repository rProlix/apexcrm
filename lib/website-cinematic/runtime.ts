import type { z } from 'zod'
import type { cinematicClipSchema } from './schema'

export type CinematicClip = z.infer<typeof cinematicClipSchema>

export function selectCinematicSource(clip: CinematicClip, mobile: boolean) {
  return mobile ? clip.mobileSrc || clip.desktopSrc : clip.desktopSrc
}

export function mapProgressToClip(clips: CinematicClip[], progress: number) {
  if (!clips.length) return null
  const total = clips.reduce((sum, clip) => sum + clip.scrollWeight, 0)
  const position = Math.max(0, Math.min(1, progress)) * total
  let cursor = 0
  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index]
    const end = cursor + clip.scrollWeight
    if (position <= end || index === clips.length - 1) {
      return {
        clip,
        index,
        localProgress: Math.max(0, Math.min(1, (position - cursor) / clip.scrollWeight)),
        next: clips[index + 1] ?? null,
      }
    }
    cursor = end
  }
  return null
}
