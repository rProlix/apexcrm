// lib/website/canva/pdf/canva-pdf-animation-mapper.ts
// Animation presets for rendered Canva PDF page visuals and action buttons.

import type { AnimationLevel } from '@/lib/website/canva/pdf-animation-recreator'

export const PAGE_VISUAL_ANIMATION_PRESETS = [
  'fadeIn',
  'fadeUp',
  'softZoomIn',
  'premiumBlurReveal',
  'characterPopIn',
  'none',
] as const

export type PageVisualAnimationPreset = (typeof PAGE_VISUAL_ANIMATION_PRESETS)[number]

export const PDF_VISUAL_ANIMATION_NOTE =
  'PDF exports are static. NexoraNow preserves the design as rendered visuals and recreates animations using native animation presets.'

export interface PageVisualAnimation {
  preset: PageVisualAnimationPreset
  delay?: number
  duration?: number
}

export interface ButtonAnimation {
  preset: 'fadeUp' | 'softZoomIn' | 'floating'
  delay?: number
  duration?: number
}

const TIMING: Record<AnimationLevel, { duration: number; baseDelay: number }> = {
  subtle: { duration: 0.55, baseDelay: 0.04 },
  balanced: { duration: 0.8, baseDelay: 0.06 },
  premium_cinematic: { duration: 1.1, baseDelay: 0.1 },
}

export function mapPageVisualAnimation(
  pageNumber: number,
  pageText: string,
  level: AnimationLevel,
  aiHint?: string,
): PageVisualAnimation {
  const timing = TIMING[level]
  if (aiHint && PAGE_VISUAL_ANIMATION_PRESETS.includes(aiHint as PageVisualAnimationPreset)) {
    return { preset: aiHint as PageVisualAnimationPreset, delay: timing.baseDelay, duration: timing.duration }
  }
  const illustrationHeavy = /\b(character|illustration|cartoon|mascot|invite)\b/i.test(pageText)
  if (pageNumber === 1) {
    return {
      preset: level === 'premium_cinematic' ? 'premiumBlurReveal' : 'softZoomIn',
      delay: 0,
      duration: timing.duration * 1.1,
    }
  }
  if (illustrationHeavy) {
    return { preset: 'characterPopIn', delay: timing.baseDelay, duration: timing.duration }
  }
  return { preset: 'fadeUp', delay: Math.min(pageNumber * timing.baseDelay, 0.35), duration: timing.duration }
}

export function mapButtonAnimation(index: number, level: AnimationLevel, actionType?: string): ButtonAnimation {
  const timing = TIMING[level]
  const preset = actionType === 'gallery' || actionType === 'event_camera' ? 'floating' : 'fadeUp'
  return {
    preset,
    delay: 0.15 + index * timing.baseDelay,
    duration: timing.duration * 0.85,
  }
}
