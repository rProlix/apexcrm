// lib/website/getPublishedSiteConfig.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeTheme } from './normalizeTheme'
import type {
  PublishedSiteConfig,
  SiteSettings,
  SitePage,
  SiteSection,
  SiteNavigationItem,
} from './types'
import type { WebsiteSnapshot } from './versionTypes'
import { publishedSiteConfigFromSnapshot } from './publishedSnapshot'
import { normalizeScrollExperienceContent } from '@/lib/website-scroll-experience/types'
import { normalizeCinematicConfig } from '@/lib/website-cinematic/schema'

/**
 * Returns the fully assembled, published website configuration for a tenant.
 *
 * - Only returns pages with status = 'published'
 * - Only returns sections with is_visible = true
 * - Only returns nav items with is_visible = true
 * - Returns null if the site is not published or has no settings row
 *
 * This is the authoritative read path for the public storefront.
 */
export async function getPublishedSiteConfig(
  tenantId: string
): Promise<PublishedSiteConfig | null> {
  let db: SupabaseClient
  try {
    db = getSupabaseServerClient() as unknown as SupabaseClient
  } catch (err) {
    console.error(
      '[getPublishedSiteConfig] Supabase client init failed:',
      err instanceof Error ? err.message : err
    )
    return null
  }

  try {
    const settingsResult = await db
      .from('site_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (settingsResult.error)
      console.error('[getPublishedSiteConfig] settings error:', settingsResult.error.message)
    const settings = settingsResult.data as unknown as SiteSettings | null
    if (!settings?.is_published) return null

    const lastPublishedVersionId = settings.last_published_version_id
    if (lastPublishedVersionId) {
      const { data: version, error: versionError } = await db
        .from('site_versions')
        .select('snapshot')
        .eq('tenant_id', tenantId)
        .eq('id', lastPublishedVersionId)
        .eq('status', 'published')
        .maybeSingle()
      if (versionError)
        console.error('[getPublishedSiteConfig] published version error:', versionError.message)
      const versionedConfig = publishedSiteConfigFromSnapshot(
        tenantId,
        settings,
        version?.snapshot as unknown as WebsiteSnapshot
      )
      if (versionedConfig)
        return mergePublishedCinematicCompatibility(db, tenantId, versionedConfig)
      // A tenant that points at a checkpoint must fail closed. Falling back to
      // mutable rows here would expose post-publish drafts on the public site.
      return null
    }

    // Legacy fallback for tenants that were published before checkpointed versions existed.
    const [pagesResult, navResult] = await Promise.all([
      db
        .from('site_pages')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('status', 'published')
        .order('sort_order', { ascending: true }),
      db
        .from('site_navigation_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true }),
    ])

    if (pagesResult.error)
      console.error('[getPublishedSiteConfig] pages error:', pagesResult.error.message)
    if (navResult.error)
      console.error('[getPublishedSiteConfig] nav error:', navResult.error.message)

    const pages = (pagesResult.data ?? []) as unknown as SitePage[]
    const navItems = (navResult.data ?? []) as unknown as SiteNavigationItem[]

    const sections = await fetchSectionsForPages(
      db,
      pages.map((p) => p.id),
      true
    )

    const sectionsByPage = groupByKey(sections as unknown as Record<string, unknown>[], 'page_id')

    return {
      tenant_id: tenantId,
      settings,
      pages: pages.map((page) => ({
        ...page,
        sections: (sectionsByPage[page.id] ?? []) as unknown as SiteSection[],
      })),
      navigation: {
        header: navItems.filter((n) => n.location === 'header'),
        footer: navItems.filter((n) => n.location === 'footer'),
      },
      theme: normalizeTheme(settings),
    }
  } catch (err) {
    console.error(
      '[getPublishedSiteConfig] unexpected error for tenant',
      tenantId,
      ':',
      err instanceof Error ? err.message : err
    )
    return null
  }
}

/**
 * Compatibility bridge for sites that attached Cinematic Scroll before public
 * rendering moved to immutable checkpoints. It can only add a visible, valid,
 * READY cinematic section to a page that exists in both the published snapshot
 * and the current published page set. Other mutable sections remain private.
 */
async function mergePublishedCinematicCompatibility(
  db: SupabaseClient,
  tenantId: string,
  config: PublishedSiteConfig
): Promise<PublishedSiteConfig> {
  const snapshotPageIds = config.pages.map((page) => page.id)
  if (!snapshotPageIds.length) return config

  const { data: livePages } = await db
    .from('site_pages')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .in('id', snapshotPageIds)
  const publishedPageIds = (livePages ?? []).map((page) => String(page.id))
  if (!publishedPageIds.length) return config

  const { data: liveSections } = await db
    .from('site_sections')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('section_type', 'scroll_experience')
    .eq('is_visible', true)
    .in('page_id', publishedPageIds)
  const candidates = (liveSections ?? []).flatMap((raw) => {
    const section = raw as unknown as SiteSection
    const content = normalizeScrollExperienceContent(section.content)
    const cinematic = normalizeCinematicConfig(content.cinematic)
    return cinematic && content.experienceId && content.experienceVersionId
      ? [{ section, content: { ...content, cinematic } }]
      : []
  })
  if (!candidates.length) return config

  const versionIds = [...new Set(candidates.map(({ content }) => content.experienceVersionId!))]
  const { data: readyVersions } = await db
    .from('website_scroll_experience_versions')
    .select('id,experience_id')
    .eq('tenant_id', tenantId)
    .eq('status', 'READY')
    .in('id', versionIds)
  const ready = new Map(
    (readyVersions ?? []).map((version) => [String(version.id), String(version.experience_id)])
  )

  return {
    ...config,
    pages: config.pages.map((page) => {
      const additions = candidates
        .filter(
          ({ section, content }) =>
            section.page_id === page.id &&
            ready.get(content.experienceVersionId!) === content.experienceId &&
            !page.sections.some((published) => published.id === section.id)
        )
        .map(({ section, content }) => ({ ...section, content }))
      return additions.length
        ? {
            ...page,
            sections: [...page.sections, ...additions].sort(
              (left, right) => left.sort_order - right.sort_order
            ),
          }
        : page
    }),
  }
}

/**
 * Returns the draft (preview) website configuration for a tenant.
 *
 * Includes both draft and published pages/sections.
 * Used exclusively by the admin preview route — never exposed publicly.
 */
export async function getDraftSiteConfig(tenantId: string): Promise<PublishedSiteConfig | null> {
  const db = getSupabaseServerClient()

  const [settingsResult, pagesResult, navResult] = await Promise.all([
    db.from('site_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
    db
      .from('site_pages')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('status', ['draft', 'published'])
      .order('sort_order', { ascending: true }),
    db
      .from('site_navigation_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('sort_order', { ascending: true }),
  ])

  const settings = settingsResult.data as unknown as SiteSettings | null
  if (!settings) return null

  const pages = (pagesResult.data ?? []) as unknown as SitePage[]
  const navItems = (navResult.data ?? []) as unknown as SiteNavigationItem[]

  const sections = await fetchSectionsForPages(
    db,
    pages.map((p) => p.id),
    false
  )
  const sectionsByPage = groupByKey(sections as unknown as Record<string, unknown>[], 'page_id')

  return {
    tenant_id: tenantId,
    settings,
    pages: pages.map((page) => ({
      ...page,
      sections: (sectionsByPage[page.id] ?? []) as unknown as SiteSection[],
    })),
    navigation: {
      header: navItems.filter((n) => n.location === 'header'),
      footer: navItems.filter((n) => n.location === 'footer'),
    },
    theme: normalizeTheme(settings),
  }
}

/**
 * Fetches a single published page by slug for the public site.
 * Returns null if the page is not published.
 */
export async function getPublishedPageBySlug(
  tenantId: string,
  slug: string
): Promise<(SitePage & { sections: SiteSection[] }) | null> {
  const db = getSupabaseServerClient()

  const { data: page } = await db
    .from('site_pages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle()

  if (!page) return null

  const sections = await fetchSectionsForPages(db, [page.id], true)

  return {
    ...(page as unknown as SitePage),
    sections,
  }
}

/**
 * Fetches a single page by slug for admin preview (includes drafts).
 */
export async function getDraftPageBySlug(
  tenantId: string,
  slug: string
): Promise<(SitePage & { sections: SiteSection[] }) | null> {
  const db = getSupabaseServerClient()

  const { data: page } = await db
    .from('site_pages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('slug', slug)
    .in('status', ['draft', 'published'])
    .maybeSingle()

  if (!page) return null

  const sections = await fetchSectionsForPages(db, [page.id], false)

  return {
    ...(page as unknown as SitePage),
    sections,
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchSectionsForPages(
  db: SupabaseClient,
  pageIds: string[],
  visibleOnly: boolean
): Promise<SiteSection[]> {
  if (pageIds.length === 0) return []

  let query = db
    .from('site_sections')
    .select('*')
    .in('page_id', pageIds)
    .order('sort_order', { ascending: true })

  if (visibleOnly) {
    query = query.eq('is_visible', true)
  }

  const { data } = await query
  return (data ?? []) as unknown as SiteSection[]
}

function groupByKey<T extends Record<string, unknown>>(
  items: T[],
  key: keyof T
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const k = String(item[key])
    if (!acc[k]) acc[k] = []
    acc[k].push(item)
    return acc
  }, {})
}
