// lib/website/registry.ts
// SERVER-ONLY. The "Websites & Apps" registry: one tenant can own many separate
// websites/apps, each an addressable record over a real content store.
//
//   source='builder'   → site_settings / site_pages (business + creative sites)
//   source='pov_event' → pov_events row (invitation/event website, POV app)
//
// The registry never replaces the content stores — it indexes them so each site
// has its own id, slug, URL, domains, and publish state, and a Business Website
// and an Invitation/Event Website never overwrite each other.

import 'server-only'
import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { publishTenantSite } from '@/lib/website/publishSite'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

export type WebsiteType = 'business' | 'creative' | 'invitational' | 'pov_event'
export type WebsiteSource = 'builder' | 'pov_event' | 'config'
export type WebsiteStatus = 'draft' | 'published' | 'archived'

export interface WebsiteRecord {
  id: string
  tenant_id: string
  business_id: string | null
  website_type: WebsiteType
  source: WebsiteSource
  name: string
  public_slug: string
  subdomain: string | null
  custom_domain: string | null
  is_primary_business_site: boolean
  is_primary_event_site: boolean
  pov_enabled: boolean
  pov_event_id: string | null
  canva_import_enabled: boolean
  canva_import_id: string | null
  status: WebsiteStatus
  published_at: string | null
  last_published_version_id: string | null
  settings: Record<string, unknown>
  draft_config?: Record<string, unknown> | null
  published_config?: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface WebsiteWithUrl extends WebsiteRecord {
  public_url: string
  edit_url: string
  preview_url: string
  live_url: string | null
  has_unpublished_changes: boolean
  canva_badge: boolean
  pov_badge: boolean
}

// Reserved names that may never be used as a public slug or subdomain.
export const RESERVED_NAMES = new Set([
  'admin', 'app', 'api', 'www', 'dashboard', 'login', 'signup', 'settings',
  'billing', 'support', 'assets', 'static', 'sites', 'events', 'pov', 'public',
])

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

export function normalizeSlug(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Strips protocol/path/port and lowercases — for custom domains. */
export function normalizeDomain(value: unknown): string | null {
  let v = String(value ?? '').trim().toLowerCase()
  if (!v) return null
  v = v.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '')
  return v || null
}

export function validateSlug(slug: string): string | null {
  if (!slug) return 'A URL slug is required.'
  if (!SLUG_RE.test(slug)) return 'Use 3–63 lowercase letters, numbers, and hyphens (no leading/trailing hyphen).'
  if (RESERVED_NAMES.has(slug)) return 'That name is reserved. Please choose another.'
  return null
}

export function validateSubdomain(sub: string): string | null {
  if (!SLUG_RE.test(sub)) return 'Subdomains use 3–63 lowercase letters, numbers, and hyphens.'
  if (RESERVED_NAMES.has(sub)) return 'That subdomain is reserved.'
  return null
}

/** Builds the canonical public URL for a website record. */
export function publicUrlFor(w: Pick<WebsiteRecord, 'website_type' | 'source' | 'public_slug' | 'custom_domain' | 'subdomain'>): string {
  if (w.custom_domain) return `https://${w.custom_domain}`
  if (w.subdomain) return `https://${w.subdomain}.${ROOT_DOMAIN}`
  if (w.source === 'config') return `/events/${w.public_slug}`
  if (w.source === 'pov_event') {
    const base = w.website_type === 'invitational' ? 'events' : 'pov'
    return `/${base}/${w.public_slug}`
  }
  return `/sites/${w.public_slug}`
}

function editUrlFor(w: WebsiteRecord): string {
  if (w.source === 'config') return `/website/canva?websiteId=${w.id}`
  if (w.source === 'pov_event' && w.pov_event_id) return `/website/pov/${w.pov_event_id}`
  return '/website'
}

function previewUrlFor(w: WebsiteRecord): string {
  return publicUrlFor(w)
}

export function withUrls(w: WebsiteRecord, ctx?: { hasUnpublishedChanges?: boolean }): WebsiteWithUrl {
  const publicUrl = publicUrlFor(w)
  return {
    ...w,
    public_url: publicUrl,
    edit_url: editUrlFor(w),
    preview_url: previewUrlFor(w),
    live_url: w.status === 'published' ? publicUrl : null,
    has_unpublished_changes: ctx?.hasUnpublishedChanges ?? false,
    canva_badge: Boolean(w.canva_import_enabled),
    pov_badge: Boolean(w.pov_enabled),
  }
}

/**
 * Self-healing: guarantees a registry row exists for the tenant's builder site
 * and for each of its pov_events. Idempotent and safe to call on every load.
 */
export async function ensureWebsiteRegistry(tenantId: string): Promise<void> {
  const db = getSupabaseServerClient() as DB
  try {
    const [{ data: tenant }, { data: settings }, { data: events }, { data: existing }] = await Promise.all([
      db.from('tenants').select('id, name, slug, subdomain, custom_domain').eq('id', tenantId).maybeSingle(),
      db.from('site_settings').select('*').eq('tenant_id', tenantId).maybeSingle(),
      db.from('pov_events').select('*').eq('tenant_id', tenantId),
      db.from('websites').select('id, source, pov_event_id, public_slug').eq('tenant_id', tenantId),
    ])
    if (!tenant) return

    const rows: Record<string, unknown>[] = existing ?? []
    const hasBuilder = rows.some((r) => r.source === 'builder')
    const eventIds = new Set(rows.filter((r) => r.pov_event_id).map((r) => r.pov_event_id as string))
    const usedSlugs = new Set(rows.map((r) => r.public_slug as string))

    const inserts: Record<string, unknown>[] = []

    if (!hasBuilder && tenant.slug) {
      const st = (settings ?? {}) as Record<string, unknown>
      const wtype = st.website_type === 'creative' ? 'creative' : 'business'
      inserts.push({
        tenant_id: tenantId,
        website_type: wtype,
        source: 'builder',
        name: tenant.name || 'My Website',
        public_slug: usedSlugs.has(tenant.slug) ? `${tenant.slug}-site` : tenant.slug,
        subdomain: (st.subdomain as string) ?? null,
        custom_domain: normalizeDomain(st.custom_domain),
        is_primary_business_site: true,
        status: st.is_published ? 'published' : 'draft',
        published_at: st.is_published ? new Date().toISOString() : null,
        canva_import_enabled: Boolean(st.canva_import_enabled),
        canva_import_id: (st.canva_import_id as string) ?? null,
      })
      usedSlugs.add(tenant.slug)
    }

    const settingsPovId = (settings as Record<string, unknown> | null)?.pov_event_id as string | undefined
    for (const ev of (events ?? []) as Record<string, unknown>[]) {
      const eid = ev.id as string
      if (eventIds.has(eid)) continue
      const isInvitational = settingsPovId === eid && (settings as Record<string, unknown>)?.website_type === 'invitational'
      let slug = ev.slug as string
      if (usedSlugs.has(slug)) slug = `${slug}-${eid.slice(0, 6)}`
      inserts.push({
        tenant_id: tenantId,
        business_id: (ev.business_id as string) ?? null,
        website_type: isInvitational ? 'invitational' : 'pov_event',
        source: 'pov_event',
        name: (ev.name as string) || 'Event',
        public_slug: slug,
        is_primary_event_site: settingsPovId === eid,
        pov_enabled: true,
        pov_event_id: eid,
        status: ev.is_active === false ? 'draft' : 'published',
      })
      usedSlugs.add(slug)
    }

    if (inserts.length) {
      const { data: created } = await db.from('websites').insert(inserts).select('id, pov_event_id')
      // Link pov_events back to their registry rows.
      for (const c of (created ?? []) as Record<string, unknown>[]) {
        if (c.pov_event_id) {
          await db.from('pov_events').update({ website_id: c.id }).eq('id', c.pov_event_id as string).is('website_id', null)
        }
      }
    }
  } catch (err) {
    console.error('[registry] ensureWebsiteRegistry error:', err instanceof Error ? err.message : err)
  }
}

/** Lists all non-archived websites for a tenant (registry self-heals first). */
export async function listWebsites(tenantId: string, opts?: { includeArchived?: boolean }): Promise<WebsiteWithUrl[]> {
  const db = getSupabaseServerClient() as DB
  await ensureWebsiteRegistry(tenantId)
  const [{ data }, { data: settings }] = await Promise.all([
    (async () => {
      let q = db.from('websites').select('*').eq('tenant_id', tenantId)
      if (!opts?.includeArchived) q = q.neq('status', 'archived')
      return q.order('is_primary_business_site', { ascending: false }).order('created_at', { ascending: true })
    })(),
    db.from('site_settings').select('has_unpublished_changes, is_published').eq('tenant_id', tenantId).maybeSingle(),
  ])
  const builderDirty = Boolean((settings as Record<string, unknown> | null)?.has_unpublished_changes)
  return ((data ?? []) as WebsiteRecord[]).map((w) => {
    let dirty = false
    if (w.source === 'builder') dirty = builderDirty
    else if (w.source === 'config' && w.status === 'published') {
      const savedAt = (w.draft_config as Record<string, unknown> | null)?.savedAt as string | undefined
      dirty = !!savedAt && !!w.published_at && new Date(savedAt) > new Date(w.published_at)
    }
    return withUrls(w, { hasUnpublishedChanges: dirty })
  })
}

export async function getWebsite(tenantId: string, id: string): Promise<WebsiteWithUrl | null> {
  const db = getSupabaseServerClient() as DB
  const { data } = await db.from('websites').select('*').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
  return data ? withUrls(data as WebsiteRecord) : null
}

/** Returns the tenant's primary builder-backed website (business/creative). */
export async function getPrimaryBuilderWebsite(tenantId: string): Promise<WebsiteWithUrl | null> {
  const db = getSupabaseServerClient() as DB
  await ensureWebsiteRegistry(tenantId)
  const { data } = await db.from('websites').select('*')
    .eq('tenant_id', tenantId).eq('source', 'builder')
    .order('is_primary_business_site', { ascending: false }).limit(1).maybeSingle()
  return data ? withUrls(data as WebsiteRecord) : null
}

export interface SlugCheck { available: boolean; reason?: string; normalized: string }

/** Checks whether a public slug is available within the tenant. */
export async function checkSlugAvailable(tenantId: string, raw: string): Promise<SlugCheck> {
  const normalized = normalizeSlug(raw)
  const invalid = validateSlug(normalized)
  if (invalid) return { available: false, reason: invalid, normalized }
  const db = getSupabaseServerClient() as DB
  const { data } = await db.from('websites').select('id')
    .eq('tenant_id', tenantId).eq('public_slug', normalized).maybeSingle()
  if (data) return { available: false, reason: 'That URL is already in use.', normalized }
  return { available: true, normalized }
}

export interface CreateWebsiteInput {
  tenantId: string
  websiteType: WebsiteType
  name: string
  slug: string
  createdBy?: string | null
}

export interface CreateWebsiteResult { website?: WebsiteWithUrl; error?: string }

/** Creates a new builder-backed (business/creative) website record. */
export async function createBuilderWebsite(input: CreateWebsiteInput): Promise<CreateWebsiteResult> {
  const db = getSupabaseServerClient() as DB
  const wtype: WebsiteType = input.websiteType === 'creative' ? 'creative' : 'business'

  const check = await checkSlugAvailable(input.tenantId, input.slug)
  if (!check.available) return { error: check.reason ?? 'Slug unavailable' }

  const { data, error } = await db.from('websites').insert({
    tenant_id: input.tenantId,
    website_type: wtype,
    source: 'builder',
    name: input.name?.trim() || 'My Website',
    public_slug: check.normalized,
    status: 'draft',
    created_by: input.createdBy ?? null,
  }).select('*').single()

  if (error) {
    const dup = /duplicate|unique/i.test(error.message)
    return { error: dup ? 'That URL is already in use.' : error.message }
  }
  return { website: withUrls(data as WebsiteRecord) }
}

/** Archives (soft-deletes) a website. Builder/business primary cannot be archived. */
export async function archiveWebsite(tenantId: string, id: string): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabaseServerClient() as DB
  const site = await getWebsite(tenantId, id)
  if (!site) return { ok: false, error: 'Website not found.' }
  if (site.is_primary_business_site) return { ok: false, error: 'The primary business website cannot be archived.' }

  await db.from('websites').update({ status: 'archived' }).eq('tenant_id', tenantId).eq('id', id)
  // For event-backed sites, also deactivate the event so its public URL stops serving.
  if (site.source === 'pov_event' && site.pov_event_id) {
    await db.from('pov_events').update({ is_active: false }).eq('id', site.pov_event_id).eq('tenant_id', tenantId)
  }
  return { ok: true }
}

/** Connects/normalizes a custom domain or subdomain on a website (globally unique). */
export async function setWebsiteDomain(
  tenantId: string, id: string,
  patch: { custom_domain?: string | null; subdomain?: string | null },
): Promise<{ ok: boolean; error?: string }> {
  const db = getSupabaseServerClient() as DB
  const update: Record<string, unknown> = {}

  if (patch.custom_domain !== undefined) {
    const dom = normalizeDomain(patch.custom_domain)
    if (dom) {
      const { data: clash } = await db.from('websites').select('id')
        .eq('custom_domain', dom).neq('id', id).maybeSingle()
      if (clash) return { ok: false, error: 'That domain is already connected to another site.' }
    }
    update.custom_domain = dom
  }
  if (patch.subdomain !== undefined) {
    const sub = patch.subdomain ? normalizeSlug(patch.subdomain) : null
    if (sub) {
      const invalid = validateSubdomain(sub)
      if (invalid) return { ok: false, error: invalid }
      const { data: clash } = await db.from('websites').select('id')
        .eq('subdomain', sub).neq('id', id).maybeSingle()
      if (clash) return { ok: false, error: 'That subdomain is already taken.' }
    }
    update.subdomain = sub
  }

  if (Object.keys(update).length === 0) return { ok: true }
  const { error } = await db.from('websites').update(update).eq('tenant_id', tenantId).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Mirrors a tenant builder publish/unpublish onto the primary builder website
 * registry row so the dashboard reflects published status immediately.
 */
export async function syncRegistryAfterPublish(
  tenantId: string,
  patch: { published: boolean; publishedAt?: string | null; versionId?: string | null },
): Promise<void> {
  const db = getSupabaseServerClient() as DB
  await ensureWebsiteRegistry(tenantId)
  const update: Record<string, unknown> = {
    status: patch.published ? 'published' : 'draft',
    published_at: patch.published ? (patch.publishedAt ?? new Date().toISOString()) : null,
  }
  if (patch.versionId) update.last_published_version_id = patch.versionId
  await db.from('websites').update(update)
    .eq('tenant_id', tenantId).eq('source', 'builder').eq('is_primary_business_site', true)
}

export interface PublishWebsiteResult {
  ok: boolean
  error?: string
  liveUrl?: string | null
  publishedAt?: string | null
  status?: WebsiteStatus
}

/**
 * Publishes ONE website by id — never the whole business.
 *   • source='builder'   → publishes the tenant builder site (shared content),
 *                          then syncs this registry row.
 *   • source='pov_event' → activates the linked pov_event and marks the row
 *                          published; revalidates only its event routes.
 */
export async function publishWebsiteById(
  tenantId: string, websiteId: string, userId?: string | null,
): Promise<PublishWebsiteResult> {
  const db = getSupabaseServerClient() as DB
  const site = await getWebsite(tenantId, websiteId)
  if (!site) return { ok: false, error: 'Website not found.' }

  const now = new Date().toISOString()

  if (site.source === 'builder') {
    const result = await publishTenantSite({ tenantId, userId })
    if (!result.ok) return { ok: false, error: result.error ?? 'Publish failed.' }
    await db.from('websites').update({
      status: 'published', published_at: result.publishedAt ?? now,
      last_published_version_id: result.versionId ?? null,
    }).eq('tenant_id', tenantId).eq('id', websiteId)
    return { ok: true, status: 'published', publishedAt: result.publishedAt ?? now, liveUrl: site.public_url }
  }

  // config-backed (Canva) event website: copy draft_config → published_config.
  if (site.source === 'config') {
    const { data: row } = await db.from('websites').select('draft_config').eq('id', websiteId).eq('tenant_id', tenantId).maybeSingle()
    const draft = (row?.draft_config as Record<string, unknown> | null) ?? null
    if (!draft || Object.keys(draft).length === 0) {
      return { ok: false, error: 'No draft content to publish. Save a Canva draft first.' }
    }
    await db.from('websites').update({ published_config: draft, status: 'published', published_at: now })
      .eq('tenant_id', tenantId).eq('id', websiteId)
    try {
      revalidatePath(`/events/${site.public_slug}`)
      revalidatePath('/website/sites')
    } catch { /* non-fatal */ }
    return { ok: true, status: 'published', publishedAt: now, liveUrl: site.public_url }
  }

  // pov_event-backed website: it goes live when its event is active.
  if (site.pov_event_id) {
    await db.from('pov_events').update({ is_active: true }).eq('id', site.pov_event_id).eq('tenant_id', tenantId)
  }
  await db.from('websites').update({ status: 'published', published_at: now })
    .eq('tenant_id', tenantId).eq('id', websiteId)

  try {
    revalidatePath(`/events/${site.public_slug}`)
    revalidatePath(`/pov/${site.public_slug}`)
    revalidatePath('/website/sites')
  } catch { /* non-fatal */ }

  return { ok: true, status: 'published', publishedAt: now, liveUrl: site.public_url }
}
