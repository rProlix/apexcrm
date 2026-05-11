// lib/website/animations/mergeAnimationConfigs.ts
// Merges global → page → section animation configs (section takes priority).

import { parseSectionAnimationConfig } from './validateAnimationConfig'
import type { ValidatedSectionAnimationConfig } from './validateAnimationConfig'

/**
 * Given raw jsonb objects from the DB, merge them into a single resolved config.
 * The section config overrides the page config which overrides the global config.
 * Returns null if no animations are enabled or all configs are empty/invalid.
 */
export function mergeAnimationConfigs(
  globalRaw: unknown,
  pageRaw:   unknown,
  sectionRaw: unknown,
): ValidatedSectionAnimationConfig | null {
  const global  = parseSectionAnimationConfig(globalRaw)
  const page    = parseSectionAnimationConfig(pageRaw)
  const section = parseSectionAnimationConfig(sectionRaw)

  // If section explicitly disabled, skip all
  if (section && section.enabled === false) return null
  // If no config at all, skip
  if (!global && !page && !section) return null

  // Merge: global baseline, then page, then section on top
  const merged: ValidatedSectionAnimationConfig = {
    v:       1,
    enabled: true,
    animation: {
      ...global?.animation,
      ...page?.animation,
      ...section?.animation,
    },
    style: {
      ...global?.style,
      ...page?.style,
      ...section?.style,
    },
    performance: {
      ...global?.performance,
      ...page?.performance,
      ...section?.performance,
    },
    sourcePlanId: section?.sourcePlanId ?? page?.sourcePlanId ?? global?.sourcePlanId,
  }

  // If no preset defined after merge, nothing to animate
  if (!merged.animation.preset && !merged.style.stylePreset) return null

  return merged
}
