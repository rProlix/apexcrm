// lib/website/publishSite.ts
// SERVER-ONLY. Canonical publish/unpublish for the tenant builder site.
// Extracted from /api/website/publish so both the route and the per-website
// publish endpoint share ONE implementation.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { applySnapshotToWebsiteTables } from '@/lib/website/versioning'
import { createWebsiteSnapshotForTenant } from '@/lib/website/snapshot/createWebsiteSnapshotForTenant'
import type { ClientPageSections } from '@/lib/website/versionTypes'
import { revalidatePath, revalidateTag } from 'next/cache'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

export interface PublishResult {
  ok: boolean
  published?: boolean
  versionId?: string
  versionNumber?: number
  pageCount?: number
  sectionCount?: number
  publishedAt?: string
  liveUrl?: string | null
  warnings?: string[]
  error?: string
  details?: string
  step?: string
  checkpointError?: Record<string, unknown> | null
}

/** Revalidates all public routes + dashboard for a tenant builder site. */
export function revalidateTenantPublicRoutes(tenantId: string, tenantSlug: string | null) {
  try {
    revalidateTag(`website:${tenantId}`)
    revalidateTag(`website:${tenantId}:public`)
    revalidateTag(`tenant:${tenantId}`)
    if (tenantSlug) {
      revalidatePath(`/sites/${tenantSlug}`)
      revalidatePath(`/sites/${tenantSlug}/`)
      for (const slug of ['about', 'services', 'menu', 'shop', 'contact', 'faq', 'book', 'reviews']) {
        revalidatePath(`/sites/${tenantSlug}/${slug}`)
      }
      revalidateTag(`website:${tenantSlug}:public`)
      revalidateTag(`tenant:${tenantSlug}`)
    }
    revalidatePath('/website')
    revalidatePath('/website/sites')
  } catch (err) {
    console.warn('[publishSite] cache revalidation error:', err instanceof Error ? err.message : err)
  }
}

async function tenantSlugFor(db: DB, tenantId: string): Promise<string | null> {
  const { data } = await db.from('tenants').select('slug').eq('id', tenantId).maybeSingle()
  return data?.slug ?? null
}

export async function unpublishTenantSite(tenantId: string): Promise<PublishResult> {
  const db = getSupabaseServerClient() as DB
  const { error } = await db.from('site_settings')
    .upsert({ tenant_id: tenantId, is_published: false }, { onConflict: 'tenant_id' })
  if (error) return { ok: false, error: error.message, step: 'settings_update' }
  revalidateTenantPublicRoutes(tenantId, await tenantSlugFor(db, tenantId))
  return { ok: true, published: false }
}

/**
 * Publishes the tenant's builder site: snapshot → checkpoint → apply →
 * mark published → revalidate. Mirrors the original /api/website/publish flow.
 */
export async function publishTenantSite(params: {
  tenantId: string
  userId?: string | null
  clientPageSections?: ClientPageSections
  clientSnapshot?: unknown
}): Promise<PublishResult> {
  const { tenantId } = params
  const userId = params.userId ?? undefined
  const db = getSupabaseServerClient() as DB

  const tenantSlug = await tenantSlugFor(db, tenantId)

  const snapResult = await createWebsiteSnapshotForTenant({
    tenantId,
    userId,
    source: 'publish',
    clientSnapshot: params.clientSnapshot,
    clientPageSections: params.clientPageSections,
    preferClientSnapshot: !!params.clientSnapshot,
    forPublish: true,
  })
  if (!snapResult.ok) return { ok: false, error: snapResult.error, details: snapResult.details, step: snapResult.step }

  const { snapshot, pageCount, sectionCount } = snapResult

  const { data: nextNumData, error: nextNumErr } = await db.rpc('get_next_site_version_number', { p_tenant_id: tenantId })
  if (nextNumErr) return { ok: false, error: 'Failed to get version number', details: nextNumErr.message, step: 'version_number' }
  const versionNumber = (nextNumData as number | null) ?? 1

  const now = new Date().toISOString()
  const { data: versionRow, error: versionErr } = await db
    .from('site_versions')
    .insert({
      tenant_id: tenantId,
      version_number: versionNumber,
      version_name: `Published ${new Date().toLocaleDateString()}`,
      label: `Published ${new Date().toLocaleDateString()}`,
      description: 'Created automatically on publish',
      status: 'draft',
      source: 'publish',
      snapshot,
      page_count: pageCount,
      section_count: sectionCount,
      created_by: userId ?? null,
      published_at: null,
      created_at: now,
      updated_at: now,
    })
    .select('id,version_number,label,source')
    .single()

  if (versionErr) {
    const e = versionErr as Record<string, unknown>
    return {
      ok: false, error: 'CHECKPOINT_SAVE_FAILED', step: 'version_insert',
      checkpointError: { code: e.code ?? null, message: e.message ?? null, details: e.details ?? null, hint: e.hint ?? null },
    }
  }

  const versionId = versionRow.id as string

  const applyResult = await applySnapshotToWebsiteTables(tenantId, snapshot, userId ?? '')
  if (!applyResult.data) return { ok: false, error: 'Failed to apply snapshot to live tables', details: applyResult.error ?? '', step: 'publish_apply' }

  await db.from('site_versions').update({ status: 'archived' }).eq('tenant_id', tenantId).eq('status', 'published')
  await db.from('site_versions').update({ status: 'published', published_at: now }).eq('id', versionId)

  const snapshotSettings = (snapshot.settings ?? {}) as Record<string, unknown>
  const settingsUpdate: Record<string, unknown> = {
    tenant_id: tenantId, is_published: true, published_at: now,
    last_published_version_id: versionId, has_unpublished_changes: false,
  }
  for (const key of ['design_system', 'theme', 'template_config', 'brand_colors', 'fonts'] as const) {
    if (snapshotSettings[key] && typeof snapshotSettings[key] === 'object') settingsUpdate[key] = snapshotSettings[key]
  }
  if (snapshotSettings.active_template_key) settingsUpdate.active_template_key = snapshotSettings.active_template_key
  if (snapshotSettings.active_template_id) settingsUpdate.active_template_id = snapshotSettings.active_template_id

  const { error: settingsErr } = await db.from('site_settings').upsert(settingsUpdate, { onConflict: 'tenant_id' })
  if (settingsErr) console.warn('[publishSite] site_settings update failed:', settingsErr.message)

  await db.from('site_pages').update({ status: 'published', updated_at: now })
    .eq('tenant_id', tenantId).eq('status', 'draft')

  await db.from('website_builder_drafts').upsert(
    { tenant_id: tenantId, dirty: false, draft_snapshot: snapshot, base_version_id: versionId },
    { onConflict: 'tenant_id' },
  )

  revalidateTenantPublicRoutes(tenantId, tenantSlug)

  db.from('website_version_events').insert({
    tenant_id: tenantId, version_id: versionId, event_type: 'published',
    metadata: { pageCount, sectionCount, publishedAt: now }, created_by: userId ?? null,
  }).then(() => null).catch(() => null)

  return {
    ok: true, published: true, versionId, versionNumber, pageCount, sectionCount,
    publishedAt: now, liveUrl: tenantSlug ? `/sites/${tenantSlug}` : null,
    warnings: snapResult.warnings ?? [],
  }
}
