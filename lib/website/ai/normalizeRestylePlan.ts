// lib/website/ai/normalizeRestylePlan.ts
// Normalizes a raw AI-generated restyle plan into a valid WebsiteRestylePlan.
//
// CRITICAL: Never throws "validation failed" for minor AI mistakes.
// Instead, fixes all fixable issues automatically.
// Only returns an error if: no usable JSON, or no sections exist.

import type {
  WebsiteRestylePlan,
  SectionRestyleUpgrade,
  PageRestyleUpgrade,
  WebsiteContrastFix,
  WebsiteMobileFix,
  WebsiteImageSuggestion,
  WebsiteAnimationPlan,
  RestyleSectionContext,
} from './restyleTypes'
import {
  normalizeDesignSystem,
  normalizeSectionDesign,
  ensureReadableSectionColors,
  buildDefaultSectionDesign,
} from '@/lib/website/design/normalizeDesignSystem'
import type { WebsiteDesignSystem, SectionDesign } from '@/lib/website/design/types'

// ── UUID guard ────────────────────────────────────────────────────────────────

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_REGEX.test(v)
}

// ── Intensity normalizer ──────────────────────────────────────────────────────

function normalizeIntensity(v: unknown): 'subtle' | 'balanced' | 'cinematic' {
  const raw = String(v ?? '').toLowerCase()
  if (['high', 'strong', 'bold', 'dramatic', 'premium', 'luxury', 'cinematic', 'ultra', 'intense', 'maximum'].includes(raw))
    return 'cinematic'
  if (['low', 'light', 'soft', 'minimal', 'gentle', 'subtle', 'quiet'].includes(raw))
    return 'subtle'
  if (raw === 'subtle' || raw === 'balanced' || raw === 'cinematic') return raw as 'subtle' | 'balanced' | 'cinematic'
  return 'balanced'
}

// ── Section lookup ────────────────────────────────────────────────────────────

interface SectionLookup {
  byId:   Map<string, RestyleSectionContext>
  byType: Map<string, RestyleSectionContext>
  all:    RestyleSectionContext[]
}

function buildLookup(sections: RestyleSectionContext[]): SectionLookup {
  const byId   = new Map<string, RestyleSectionContext>()
  const byType = new Map<string, RestyleSectionContext>()

  for (const s of sections) {
    byId.set(s.id, s)
    if (s.type && !byType.has(s.type.toLowerCase())) {
      byType.set(s.type.toLowerCase(), s)
    }
  }

  return { byId, byType, all: sections }
}

function resolveSectionId(
  candidates: unknown[],
  lookup: SectionLookup,
  availableIds: Set<string>,
): string | null {
  for (const c of candidates) {
    if (typeof c !== 'string' || !c.trim()) continue
    const trimmed = c.trim()

    if (UUID_REGEX.test(trimmed)) {
      return availableIds.has(trimmed) ? trimmed : null
    }

    // Try type match
    const typeMatch = lookup.byType.get(trimmed.toLowerCase())
    if (typeMatch) return typeMatch.id
  }
  return null
}

// ── Background strategy normalizer ───────────────────────────────────────────

const VALID_BG_STRATEGIES = new Set([
  'alternating_soft', 'continuous_gradient', 'layered_surfaces', 'image_blend', 'premium_cards',
])

function normalizeBgStrategy(v: unknown): PageRestyleUpgrade['backgroundStrategy'] {
  const raw = String(v ?? '').toLowerCase()
  if (VALID_BG_STRATEGIES.has(raw)) return raw as PageRestyleUpgrade['backgroundStrategy']
  return 'alternating_soft'
}

// ── Section flow normalizer ───────────────────────────────────────────────────

const VALID_FLOWS = new Set(['soft_blend', 'curved', 'angled', 'layered', 'editorial', 'minimal'])

function normalizeSectionFlow(v: unknown): PageRestyleUpgrade['sectionFlow'] {
  const raw = String(v ?? '').toLowerCase()
  if (VALID_FLOWS.has(raw)) return raw as PageRestyleUpgrade['sectionFlow']
  return 'soft_blend'
}

// ── Ensure background variety ─────────────────────────────────────────────────
// Prevent adjacent sections from all having the same flat solid background.

function ensureBackgroundVariety(upgrades: SectionRestyleUpgrade[]): SectionRestyleUpgrade[] {
  if (upgrades.length < 3) return upgrades

  let lastBg: string | null = null
  let consecutiveCount = 0

  return upgrades.map((u, i) => {
    const currentBg = u.design.backgroundType ?? 'solid'
    const currentVal = u.design.backgroundValue ?? ''

    if (currentBg === 'solid' && currentBg === lastBg && consecutiveCount >= 2) {
      // Break the monotony — add a soft gradient wash
      const altUpgrade: SectionRestyleUpgrade = {
        ...u,
        design: {
          ...u.design,
          backgroundType: 'gradient',
          backgroundValue: i % 2 === 0
            ? 'linear-gradient(180deg, var(--ds-surface) 0%, var(--ds-bg) 100%)'
            : 'linear-gradient(180deg, var(--ds-surface-alt) 0%, var(--ds-surface) 100%)',
        },
      }
      consecutiveCount = 0
      lastBg = 'gradient'
      return altUpgrade
    }

    if (currentBg === lastBg && currentVal.includes('var(--ds-bg)') && consecutiveCount >= 1) {
      consecutiveCount++
    } else {
      consecutiveCount = currentBg === 'solid' ? 1 : 0
      lastBg = currentBg
    }

    return u
  })
}

// ── Normalize a single section upgrade ───────────────────────────────────────

function normalizeSectionUpgrade(
  raw: unknown,
  lookup: SectionLookup,
  availableIds: Set<string>,
  designSystem: WebsiteDesignSystem,
): SectionRestyleUpgrade | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const u = raw as Record<string, unknown>

  // Resolve section ID
  const candidates: unknown[] = [
    u.sectionId, u.section_id, u.id, u.sectionKey, u.section_key,
    u.sectionType, u.section_type, u.type, u.title, u.sectionTitle,
  ]
  const sectionId = resolveSectionId(candidates, lookup, availableIds)

  // Section type
  const sectionType = String(u.sectionType ?? u.section_type ?? u.type ?? '')

  // Design — normalize and enforce readability
  const rawDesign = u.design && typeof u.design === 'object' ? u.design : {}
  const normalizedDesign = normalizeSectionDesign(rawDesign, designSystem)
  const readableDesign = ensureReadableSectionColors(normalizedDesign, designSystem)

  return {
    sectionId,
    sectionType,
    title:           typeof u.title === 'string' ? u.title : undefined,
    design:          readableDesign,
    layoutVariant:   typeof u.layoutVariant === 'string' ? u.layoutVariant : 'default',
    visualIntent:    typeof u.visualIntent === 'string' ? u.visualIntent : '',
    preserveContent: true,
  }
}

// ── Main normalizer ───────────────────────────────────────────────────────────

export interface NormalizeRestylePlanOptions {
  availableSections: RestyleSectionContext[]
  businessCategory:  string | null
}

export interface NormalizeResult {
  plan:  WebsiteRestylePlan | null
  error: string | null
}

export function normalizeRestylePlan(
  rawPlan: unknown,
  opts:    NormalizeRestylePlanOptions,
): NormalizeResult {
  const { availableSections, businessCategory } = opts

  if (!rawPlan || typeof rawPlan !== 'object' || Array.isArray(rawPlan)) {
    return { plan: null, error: 'AI returned no usable JSON' }
  }

  const raw = rawPlan as Record<string, unknown>
  const lookup = buildLookup(availableSections)
  const availableIds = new Set(availableSections.map((s) => s.id))
  const warnings: string[] = []

  // ── 1. Normalize design system (falls back to category preset on any issue) ─
  const rawDs = raw.designSystem && typeof raw.designSystem === 'object' ? raw.designSystem : {}
  const designSystem = normalizeDesignSystem(rawDs, businessCategory)

  // ── 2. Normalize page upgrades ────────────────────────────────────────────
  const rawPageUpgrades = Array.isArray(raw.pageUpgrades) ? raw.pageUpgrades : []
  const pageUpgrades: PageRestyleUpgrade[] = rawPageUpgrades.map((p: unknown) => {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null
    const pu = p as Record<string, unknown>
    return {
      pageId:             String(pu.pageId ?? ''),
      pageSlug:           String(pu.pageSlug ?? '/'),
      layoutMood:         String(pu.layoutMood ?? ''),
      backgroundStrategy: normalizeBgStrategy(pu.backgroundStrategy),
      sectionFlow:        normalizeSectionFlow(pu.sectionFlow),
    } satisfies PageRestyleUpgrade
  }).filter((p): p is PageRestyleUpgrade => p !== null)

  // ── 3. Normalize section upgrades ─────────────────────────────────────────
  const rawUpgrades = Array.isArray(raw.sectionUpgrades) ? raw.sectionUpgrades : []
  let sectionUpgrades = rawUpgrades
    .map((u: unknown) => normalizeSectionUpgrade(u, lookup, availableIds, designSystem))
    .filter((u): u is SectionRestyleUpgrade => u !== null)

  // Ensure every section has at least a default design upgrade
  const coveredIds = new Set(sectionUpgrades.map((u) => u.sectionId).filter(Boolean))
  for (const section of availableSections) {
    if (!coveredIds.has(section.id)) {
      warnings.push(`AI did not provide upgrade for section ${section.type} (${section.id}). Using default.`)
      const defaultDesign = buildDefaultSectionDesign(designSystem)
      sectionUpgrades.push({
        sectionId:      section.id,
        sectionType:    section.type,
        title:          section.title ?? undefined,
        design:         defaultDesign,
        layoutVariant:  'default',
        visualIntent:   'Default upgrade applied',
        preserveContent: true,
      })
    }
  }

  // Ensure background variety (no monotonous flat sections)
  sectionUpgrades = ensureBackgroundVariety(sectionUpgrades)

  // ── 4. Normalize contrast fixes ───────────────────────────────────────────
  const rawContrast = Array.isArray(raw.contrastFixes) ? raw.contrastFixes : []
  const contrastFixes: WebsiteContrastFix[] = rawContrast.map((cf: unknown) => {
    const c = cf && typeof cf === 'object' ? cf as Record<string, unknown> : {}
    const validFields = ['textColor', 'subtextColor', 'buttonColor', 'overlay']
    return {
      sectionId:   resolveSectionId([c.sectionId], lookup, availableIds),
      sectionType: String(c.sectionType ?? ''),
      field:       validFields.includes(String(c.field)) ? c.field as WebsiteContrastFix['field'] : 'textColor',
      issue:       String(c.issue ?? ''),
      fix:         String(c.fix ?? ''),
    }
  })

  // ── 5. Normalize mobile fixes ─────────────────────────────────────────────
  const rawMobile = Array.isArray(raw.mobileFixes) ? raw.mobileFixes : []
  const mobileFixes: WebsiteMobileFix[] = rawMobile.map((mf: unknown) => {
    const m = mf && typeof mf === 'object' ? mf as Record<string, unknown> : {}
    return {
      sectionId:   resolveSectionId([m.sectionId], lookup, availableIds),
      sectionType: String(m.sectionType ?? ''),
      issue:       String(m.issue ?? ''),
      fix:         String(m.fix ?? ''),
    }
  })

  // ── 6. Normalize animation plan (optional) ────────────────────────────────
  let animationPlan: WebsiteAnimationPlan | undefined = undefined
  if (raw.animationPlan && typeof raw.animationPlan === 'object' && !Array.isArray(raw.animationPlan)) {
    const ap = raw.animationPlan as Record<string, unknown>
    const rawAnims = Array.isArray(ap.animations) ? ap.animations : []
    const VALID_TARGET_TYPES = new Set(['page', 'section', 'component'])

    animationPlan = {
      globalMotionStyle:     String(ap.globalMotionStyle ?? ''),
      reducedMotionRespected: ap.reducedMotionRespected !== false,
      animations: rawAnims.map((a: unknown) => {
        if (!a || typeof a !== 'object') return null
        const anim = a as Record<string, unknown>
        const rawTargetType = String(anim.targetType ?? 'section')
        const targetType = VALID_TARGET_TYPES.has(rawTargetType)
          ? rawTargetType as 'page' | 'section' | 'component'
          : 'section'

        return {
          targetType,
          sectionId:  targetType === 'section' ? resolveSectionId([anim.sectionId, anim.targetKey], lookup, availableIds) : null,
          targetKey:  typeof anim.targetKey === 'string' ? anim.targetKey : undefined,
          preset:     String(anim.preset ?? anim.animationPreset ?? 'fade_up'),
          intensity:  normalizeIntensity(anim.intensity),
          durationMs: Math.min(3000, Math.max(100, Number(anim.durationMs ?? 600))),
          delayMs:    Math.min(2000, Math.max(0,   Number(anim.delayMs   ?? 0))),
          easing:     String(anim.easing ?? 'smooth'),
          mobileEnabled: anim.mobileEnabled !== false,
          reason:     String(anim.reason ?? ''),
        }
      }).filter(Boolean) as WebsiteAnimationPlan['animations'],
    }
  }

  // ── 7. Normalize image suggestions (optional) ─────────────────────────────
  let imageSuggestions: WebsiteImageSuggestion[] | undefined = undefined
  if (Array.isArray(raw.imageSuggestions) && raw.imageSuggestions.length > 0) {
    imageSuggestions = raw.imageSuggestions.map((is: unknown) => {
      if (!is || typeof is !== 'object') return null
      const img = is as Record<string, unknown>
      return {
        sectionId:   resolveSectionId([img.sectionId], lookup, availableIds),
        sectionType: String(img.sectionType ?? ''),
        slotKey:     String(img.slotKey ?? 'primary'),
        prompt:      String(img.prompt ?? ''),
        style:       String(img.style ?? 'photorealistic'),
        aspectRatio: String(img.aspectRatio ?? '16:9'),
        notes:       String(img.notes ?? ''),
      }
    }).filter(Boolean) as WebsiteImageSuggestion[]
  }

  // ── 8. Collect warnings from raw plan ────────────────────────────────────
  if (Array.isArray(raw.warnings)) {
    for (const w of raw.warnings) {
      if (typeof w === 'string' && w.trim()) warnings.push(w.trim())
    }
  }

  // ── 9. Build final plan ───────────────────────────────────────────────────
  const plan: WebsiteRestylePlan = {
    summary:         String(raw.summary ?? 'AI Restyle applied'),
    designSystem,
    pageUpgrades,
    sectionUpgrades,
    contrastFixes,
    mobileFixes,
    warnings,
    ...(animationPlan ? { animationPlan } : {}),
    ...(imageSuggestions ? { imageSuggestions } : {}),
  }

  return { plan, error: null }
}
