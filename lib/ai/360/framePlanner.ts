// lib/ai/360/framePlanner.ts
// Generates an ordered frame plan with evenly spaced angles and shot metadata.
// SERVER-ONLY.

import type { P360FramePlan } from './types'

const DIRECTION_MAP: [number, string][] = [
  [  0, 'front'],
  [ 45, 'front-right'],
  [ 90, 'right'],
  [135, 'back-right'],
  [180, 'back'],
  [225, 'back-left'],
  [270, 'left'],
  [315, 'front-left'],
]

function getShotDirection(angleDeg: number): string {
  let closest = DIRECTION_MAP[0][1]
  let minDiff = 360
  for (const [a, label] of DIRECTION_MAP) {
    const diff = Math.abs(((angleDeg - a) + 360) % 360)
    const wrapped = Math.min(diff, 360 - diff)
    if (wrapped < minDiff) { minDiff = wrapped; closest = label }
  }
  return closest
}

/**
 * Build an ordered list of frames with angles and shot directions.
 * Supports 18, 24, or 36 frames (or any positive integer).
 */
export function buildFramePlan(
  frameCount: number,
  turnDirection: 'clockwise' | 'counter_clockwise' = 'clockwise',
): Omit<P360FramePlan, 'prompt'>[] {
  const step = 360 / frameCount
  return Array.from({ length: frameCount }, (_, i) => {
    const angleDeg = turnDirection === 'clockwise'
      ? Math.round(step * i)
      : Math.round(360 - step * i) % 360
    return {
      frameIndex:    i,
      angleDeg,
      shotDirection: getShotDirection(angleDeg),
    }
  })
}

/** Camera preset → sensible frame count */
export function frameCountFromCameraPreset(preset: string | null): number {
  switch (preset) {
    case 'hero_spin_18':            return 18
    case 'turntable_standard_24':   return 24
    case 'detail_spin_24':          return 24
    case 'turntable_smooth_36':     return 36
    case 'premium_showcase_36':     return 36
    default:                        return 36
  }
}
