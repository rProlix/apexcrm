// lib/website/premium3d/diagnostics.ts
//
// Server-side diagnostics for the Premium 3D Scroll Hero feature. Inspects the
// tenant's sections + 3D assets and reports problems the builder/preview should
// surface (missing assets, missing posters/fallbacks, invalid render modes,
// large sequences, draft/published status, etc).
//
// WebGL / video-scrub browser support is detected client-side (see the
// diagnostics page) — it cannot be determined on the server.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeScrollHeroContent } from './types'

export interface SectionDiagnostic {
  sectionId:    string
  pageId:       string
  pageStatus:   string
  isVisible:    boolean
  renderMode:   string
  rawRenderMode: string
  headline:     string
  // Active media references
  activeVideoAssetId:         string | null
  activeImageSequenceAssetId: string | null
  posterAssetId:              string | null
  fallbackAssetId:            string | null
  videoUrlPresent:           boolean
  posterUrlPresent:          boolean
  fallbackUrlPresent:        boolean
  imageSequenceFrameCount:   number
  /** True when the page is published (this section is live publicly) */
  isLive:       boolean
  issues:       string[]
  warnings:     string[]
}

export interface ScrollHeroDiagnostics {
  dependencies: Array<{ name: string; purpose: string }>
  isPublished:  boolean
  sectionCount: number
  sections:     SectionDiagnostic[]
  assets: {
    total:           number
    byType:          Record<string, number>
    brokenUrls:      Array<{ id: string; name: string; reason: string }>
    largeWarnings:   Array<{ id: string; name: string; sizeMb: number }>
  }
  summary: {
    sectionsWithMissingAssets: number
    sectionsMissingPoster:     number
    sectionsMissingFallback:   number
    invalidRenderModes:        number
  }
}

const EXPECTED_DEPS = [
  { name: 'three',                purpose: 'WebGL 3D engine' },
  { name: '@react-three/fiber',   purpose: 'React renderer for Three.js' },
  { name: '@react-three/drei',    purpose: 'Helpers (useGLTF, Environment)' },
  { name: 'gsap',                 purpose: 'ScrollTrigger pin + scrub' },
  { name: 'lenis',                purpose: 'Smooth scroll (optional)' },
  { name: 'splitting',            purpose: 'Text splitting (React-safe splitter used instead)' },
]

const VALID_RENDER_MODES = new Set(['three_model', 'video_scrub'])
const LARGE_ASSET_MB = 50

export async function buildScrollHeroDiagnostics(tenantId: string): Promise<ScrollHeroDiagnostics> {
  const db = getSupabaseServerClient()

  // Published status
  const { data: settings } = await db
    .from('site_settings')
    .select('is_published')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  // Page statuses
  const { data: pages } = await db
    .from('site_pages')
    .select('id, status')
    .eq('tenant_id', tenantId)
  const pageStatus = new Map((pages ?? []).map((p) => [p.id as string, p.status as string]))

  // Scroll-hero sections
  const { data: rawSections } = await db
    .from('site_sections')
    .select('id, page_id, content, is_visible, section_type')
    .eq('tenant_id', tenantId)
    .eq('section_type', 'premium_3d_scroll_hero')

  const sections: SectionDiagnostic[] = []
  let missingAssets = 0
  let missingPoster = 0
  let missingFallback = 0
  let invalidModes = 0

  for (const row of rawSections ?? []) {
    const rawContent = (row.content ?? {}) as Record<string, unknown>
    const rawMode = String(rawContent.renderMode ?? '')
    const c = normalizeScrollHeroContent(rawContent)
    const issues: string[] = []
    const warnings: string[] = []

    if (rawMode && !VALID_RENDER_MODES.has(rawMode)) {
      issues.push(`Invalid renderMode "${rawMode}" (corrected to ${c.renderMode})`)
      invalidModes++
    }

    if (c.renderMode === 'three_model') {
      if (!c.modelUrl) { issues.push('No 3D model uploaded — shows demo/gradient only'); missingAssets++ }
    } else {
      if (c.useImageSequence) {
        if ((c.imageSequenceUrls?.length ?? 0) < 2) { issues.push('Image sequence has fewer than 2 frames'); missingAssets++ }
        if ((c.imageSequenceUrls?.length ?? 0) > 150) warnings.push(`Large image sequence (${c.imageSequenceUrls?.length} frames)`)
      } else if (!c.videoUrl) {
        issues.push('No video uploaded for video scrub'); missingAssets++
      }
      if (!c.posterUrl) { warnings.push('No poster image set'); missingPoster++ }
    }

    if (!c.fallbackImageUrl) { warnings.push('No fallback image set'); missingFallback++ }

    const status = pageStatus.get(row.page_id as string) ?? 'unknown'
    const isLive = status === 'published'
    if (!isLive && c.renderMode === 'video_scrub' && (c.videoUrl || (c.imageSequenceUrls?.length ?? 0) > 1)) {
      warnings.push('Media is saved in draft — publish the website to show it publicly')
    }

    sections.push({
      sectionId:    row.id as string,
      pageId:       row.page_id as string,
      pageStatus:   status,
      isVisible:    row.is_visible !== false,
      renderMode:   c.renderMode,
      rawRenderMode: rawMode || c.renderMode,
      headline:     c.headline,
      activeVideoAssetId:         c.activeVideoAssetId ?? null,
      activeImageSequenceAssetId: c.activeImageSequenceAssetId ?? null,
      posterAssetId:              c.posterAssetId ?? null,
      fallbackAssetId:            c.fallbackAssetId ?? null,
      videoUrlPresent:           !!c.videoUrl,
      posterUrlPresent:          !!c.posterUrl,
      fallbackUrlPresent:        !!c.fallbackImageUrl,
      imageSequenceFrameCount:   c.imageSequenceUrls?.length ?? 0,
      isLive,
      issues,
      warnings,
    })
  }

  // Assets — website_3d_assets is not in the generated Supabase types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: assets } = await (db as any)
    .from('website_3d_assets')
    .select('id, name, asset_type, public_url, file_size_bytes')
    .eq('tenant_id', tenantId)

  const byType: Record<string, number> = {}
  const brokenUrls: ScrollHeroDiagnostics['assets']['brokenUrls'] = []
  const largeWarnings: ScrollHeroDiagnostics['assets']['largeWarnings'] = []

  for (const a of assets ?? []) {
    const type = String(a.asset_type)
    byType[type] = (byType[type] ?? 0) + 1
    if (!a.public_url) brokenUrls.push({ id: a.id as string, name: a.name as string, reason: 'Missing public URL' })
    const sizeMb = a.file_size_bytes ? Number(a.file_size_bytes) / 1024 / 1024 : 0
    if (sizeMb > LARGE_ASSET_MB) largeWarnings.push({ id: a.id as string, name: a.name as string, sizeMb: Math.round(sizeMb) })
  }

  return {
    dependencies: EXPECTED_DEPS,
    isPublished:  !!settings?.is_published,
    sectionCount: sections.length,
    sections,
    assets: {
      total: (assets ?? []).length,
      byType,
      brokenUrls,
      largeWarnings,
    },
    summary: {
      sectionsWithMissingAssets: missingAssets,
      sectionsMissingPoster:     missingPoster,
      sectionsMissingFallback:   missingFallback,
      invalidRenderModes:        invalidModes,
    },
  }
}
