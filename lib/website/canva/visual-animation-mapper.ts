// lib/website/canva/visual-animation-mapper.ts
// Animation presets for imported Canva PDF visual layers (characters, graphics,
// decorative elements). Pure + dependency-free.

import type { AnimationLevel } from '@/lib/website/canva/pdf-animation-recreator'

export const VISUAL_ANIMATION_PRESETS = [
  'characterPopIn',
  'characterFloatIn',
  'graphicFadeUp',
  'graphicSlideInLeft',
  'graphicSlideInRight',
  'decorativeFloat',
  'softZoomIn',
  'imageReveal',
  'sparkleIn',
  'premiumBlurReveal',
  'fadeIn',
  'fadeUp',
  'none',
] as const

export type VisualAnimationPreset = (typeof VISUAL_ANIMATION_PRESETS)[number]

export type VisualLayerKind = 'background' | 'image' | 'graphic' | 'character' | 'decorative'

const KIND_PRESET: Record<VisualLayerKind, Record<AnimationLevel, VisualAnimationPreset>> = {
  background:  { subtle: 'fadeIn', balanced: 'softZoomIn', premium_cinematic: 'softZoomIn' },
  image:       { subtle: 'fadeIn', balanced: 'imageReveal', premium_cinematic: 'imageReveal' },
  graphic:     { subtle: 'fadeIn', balanced: 'graphicFadeUp', premium_cinematic: 'sparkleIn' },
  character:   { subtle: 'fadeIn', balanced: 'characterPopIn', premium_cinematic: 'characterFloatIn' },
  decorative:  { subtle: 'fadeIn', balanced: 'decorativeFloat', premium_cinematic: 'sparkleIn' },
}

export interface VisualLayerAnimation {
  preset: VisualAnimationPreset
  delay?: number
  duration?: number
  trigger?: 'onView' | 'onScroll'
}

const TIMING: Record<AnimationLevel, { duration: number; baseDelay: number }> = {
  subtle: { duration: 0.55, baseDelay: 0.04 },
  balanced: { duration: 0.75, baseDelay: 0.06 },
  premium_cinematic: { duration: 1.05, baseDelay: 0.1 },
}

export function inferVisualLayerKind(label?: string, type?: string): VisualLayerKind {
  const t = `${type ?? ''} ${label ?? ''}`.toLowerCase()
  if (t.includes('character') || t.includes('person') || t.includes('people') || t.includes('illustration')) return 'character'
  if (t.includes('decor') || t.includes('ornament') || t.includes('sparkle')) return 'decorative'
  if (t.includes('graphic') || t.includes('icon') || t.includes('shape')) return 'graphic'
  if (t.includes('background') || t.includes('page')) return 'background'
  if (t.includes('photo') || t.includes('image')) return 'image'
  return 'graphic'
}

export function mapVisualLayerAnimation(
  kind: VisualLayerKind,
  level: AnimationLevel,
  index = 0,
  aiHint?: string,
): VisualLayerAnimation {
  const timing = TIMING[level]
  const preset = (aiHint && VISUAL_ANIMATION_PRESETS.includes(aiHint as VisualAnimationPreset))
    ? (aiHint as VisualAnimationPreset)
    : KIND_PRESET[kind][level]
  return {
    preset,
    delay: Math.min(index * timing.baseDelay, 0.45),
    duration: timing.duration,
    trigger: 'onView',
  }
}

export function mapPageBackgroundAnimation(level: AnimationLevel): VisualLayerAnimation {
  return mapVisualLayerAnimation('background', level, 0)
}
