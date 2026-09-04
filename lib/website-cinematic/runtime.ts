import type { z } from 'zod'
import type { cinematicClipSchema, CinematicLayer } from './schema'

// Runtime helpers also accept pre-parse clip objects; schema defaults such as
// `order` and `preload` are intentionally optional at this boundary.
export type CinematicClip = z.input<typeof cinematicClipSchema>

export function selectCinematicSource(clip: CinematicClip, mobile: boolean) {
  return mobile ? clip.mobileSrc || clip.desktopSrc : clip.desktopSrc
}

export function orderCinematicClips(clips: CinematicClip[]) {
  return [...clips].sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
}

export function resolveCinematicLayer(
  layer: CinematicLayer,
  breakpoint: 'desktop' | 'tablet' | 'mobile'
): CinematicLayer & { visible?: boolean } {
  const desktop = layer.responsive?.desktop ?? {}
  const tablet =
    breakpoint === 'tablet' || breakpoint === 'mobile' ? (layer.responsive?.tablet ?? {}) : {}
  const mobile = breakpoint === 'mobile' ? (layer.responsive?.mobile ?? {}) : {}
  return { ...layer, ...desktop, ...tablet, ...mobile }
}

export function mapProgressToClip(clips: CinematicClip[], progress: number) {
  if (!clips.length) return null
  const total = clips.reduce((sum, clip) => sum + (clip.scrollWeight ?? 1), 0)
  const position = Math.max(0, Math.min(1, progress)) * total
  let cursor = 0
  for (let index = 0; index < clips.length; index++) {
    const clip = clips[index]
    const weight = clip.scrollWeight ?? 1
    const end = cursor + weight
    if (position <= end || index === clips.length - 1) {
      return {
        clip,
        index,
        localProgress: Math.max(0, Math.min(1, (position - cursor) / weight)),
        next: clips[index + 1] ?? null,
      }
    }
    cursor = end
  }
  return null
}
