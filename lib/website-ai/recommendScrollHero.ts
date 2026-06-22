// lib/website-ai/recommendScrollHero.ts
//
// AI helper: recommends a Premium 3D Scroll Hero concept based on business type.
//
// IMPORTANT: This NEVER fabricates a real asset. It always produces a config
// with assetPlaceholder = true and an assetNeededNote describing exactly what
// the business must upload (GLB/GLTF, H.264 MP4, or image sequence) for the full
// effect. The section renders a safe premium gradient / demo until an asset is
// provided, so AI output is honest about what exists.

import {
  defaultPremium3DScrollHeroContent,
  type Premium3DScrollHeroContent,
} from '@/lib/website/premium3d/types'
import {
  buildContentFromPreset,
  INDUSTRY_PRESET_MAP,
} from '@/lib/website/premium3d/presets'

/** Map a detected business type / free-text industry to an industry preset key */
export function presetKeyForBusiness(businessType: string | null | undefined): string {
  const t = (businessType ?? '').toLowerCase()
  if (/car|vehicle|auto|dealer|rental/.test(t)) return 'vehicle_showroom'
  if (/salon|beauty|hair|spa|barber/.test(t)) return 'salon_makeover'
  if (/plumb|trade|hvac|electric|handy/.test(t)) return 'trades_tool_orbit'
  if (/restaurant|food|cafe|dining|bakery|menu/.test(t)) return 'dish_reveal'
  if (/construct|contractor|build|roof|home build/.test(t)) return 'construction_build'
  if (/fitness|gym|train|wellness/.test(t)) return 'fitness_transformation'
  if (/law|legal|attorney|account|consult|finance|medical|clinic/.test(t)) return 'luxury_abstract'
  if (/shoe|apparel|jewel|furniture|product|shop|store|ecommerce|retail/.test(t)) return 'product_spin'
  if (/character|mascot|game|entertain|kids/.test(t)) return 'mascot_intro'
  return 'product_spin'
}

export interface ScrollHeroRecommendation {
  content:        Premium3DScrollHeroContent
  recommendedRenderMode: 'three_model' | 'video_scrub'
  suggestedAssetType: string
  presetKey:      string
}

/**
 * Build a recommended Premium 3D Scroll Hero config for a business.
 * @param businessType detected or free-text business/industry
 * @param overrides optional copy/palette overrides from the AI model
 */
export function recommendScrollHero(
  businessType: string | null | undefined,
  overrides?: Partial<Premium3DScrollHeroContent>,
): ScrollHeroRecommendation {
  const presetKey = presetKeyForBusiness(businessType)
  const preset = INDUSTRY_PRESET_MAP.get(presetKey)
  const base = buildContentFromPreset(presetKey, defaultPremium3DScrollHeroContent())

  // Drop undefined overrides so they never clobber preset/base values.
  const cleanOverrides = Object.fromEntries(
    Object.entries(overrides ?? {}).filter(([, v]) => v !== undefined),
  ) as Partial<Premium3DScrollHeroContent>

  const content: Premium3DScrollHeroContent = {
    ...base,
    ...cleanOverrides,
    // Always honest: no real asset was created by AI.
    assetPlaceholder: true,
    assetNeededNote:
      preset?.assetNeeded ??
      'Upload a GLB/GLTF model (3D mode) or an H.264 MP4 / image sequence (video mode) for the full effect.',
    // Never let overrides smuggle in a fake asset URL.
    modelUrl: overrides?.modelUrl ?? null,
    videoUrl: overrides?.videoUrl ?? null,
    imageSequenceUrls: overrides?.imageSequenceUrls ?? [],
  }

  const suggestedAssetType =
    content.renderMode === 'three_model'
      ? 'GLB/GLTF 3D model (or product fallback image)'
      : content.useImageSequence
        ? 'WebP/JPG image sequence (frame-perfect)'
        : 'H.264 MP4 video (muted, ≤1080p) + poster'

  return {
    content,
    recommendedRenderMode: content.renderMode,
    suggestedAssetType,
    presetKey,
  }
}
