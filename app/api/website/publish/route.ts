// app/api/website/publish/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { applySnapshotToWebsiteTables } from '@/lib/website/versioning'
import { createWebsiteSnapshotForTenant } from '@/lib/website/snapshot/createWebsiteSnapshotForTenant'
import type { ClientPageSections } from '@/lib/website/versionTypes'
import { revalidatePath, revalidateTag } from 'next/cache'

function forbidden() {
  return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
}

function fail(error: string, details?: string, step?: string, status = 500) {
  console.error(`[website-publish] ${step ?? 'unknown'}: ${error}`, details ?? '')
  return NextResponse.json({ ok: false, error, details, step }, { status })
}

/**
 * POST /api/website/publish
 *
 * Full publish flow (when publish: true):
 *   1. Build snapshot from live tables (always — skip stale dirty draft)
 *   2. Insert a "publish" site_versions checkpoint
 *   3. Apply snapshot to live site_pages / site_sections
 *   4. Sync site_settings with design/template data from snapshot
 *   5. Archive old published versions → mark new as published
 *   6. Promote draft pages to published
 *   7. Revalidate Next.js cache for all public routes
 *   8. Return live URL + published version id
 *
 * Unpublish (publish: false):
 *   - Only updates site_settings.is_published = false + revalidates
 */
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  let body: Record<string, unknown>
  try { body = await req.json() } catch { body = {} }

  const isPublish = Boolean(body.publish)

  // ── Resolve tenant_id ─────────────────────────────────────────────────────
  let tenantId: string | null = null
  const bodyTenantId = sanitizeTenantId(body.tenant_id)
  if (ctx.role === 'owner') {
    tenantId = bodyTenantId ?? sanitizeTenantId(ctx.tenant_id)
  } else {
    const fromCtx  = sanitizeTenantId(ctx.tenant_id)
    const fromBody = bodyTenantId
    if (fromCtx && fromBody && fromCtx !== fromBody) return forbidden()
    tenantId = fromCtx ?? fromBody
  }
  if (!tenantId) return fail('No tenant resolved', undefined, 'tenant', 400)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any

  // Resolve tenant slug for cache revalidation
  const { data: tenantRow } = await db
    .from('tenants')
    .select('slug')
    .eq('id', tenantId)
    .maybeSingle() as { data: { slug: string } | null; error: unknown }
  const tenantSlug = tenantRow?.slug ?? null

  // ── UNPUBLISH path ────────────────────────────────────────────────────────
  if (!isPublish) {
    const { data: settings, error: settingsErr } = await db
      .from('site_settings')
      .upsert({ tenant_id: tenantId, is_published: false }, { onConflict: 'tenant_id' })
      .select('*')
      .single()
    if (settingsErr) return fail(settingsErr.message, undefined, 'settings_update')

    // Revalidate so the public site shows "coming soon"
    revalidatePublicRoutes(tenantId, tenantSlug)

    return NextResponse.json({ ok: true, published: false, settings })
  }

  // ── PUBLISH path ──────────────────────────────────────────────────────────
  // IMPORTANT: ctx.auth_id is the auth.users UUID required by the FK on
  // site_versions.created_by. ctx.id is the public.users profile UUID — using
  // it here caused "Checkpoint save failed" FK violations in all prior versions.
  const userId = ctx.auth_id ?? undefined

  // Extract optional client sections from request body (sent by EditBar)
  const clientPageSections = body.clientPageSections as ClientPageSections | undefined
  const clientSnapshot     = body.snapshot

  // Step 1: Build snapshot.
  // IMPORTANT: forPublish=true — always reads from live DB tables, never from
  // a stale dirty website_builder_drafts snapshot. This ensures that section
  // edits applied directly to site_sections are included.
  const snapResult = await createWebsiteSnapshotForTenant({
    tenantId,
    userId,
    source:              'publish',
    clientSnapshot,
    clientPageSections,
    preferClientSnapshot: !!clientSnapshot,
    forPublish:          true,
  })

  if (!snapResult.ok) {
    return fail(snapResult.error, snapResult.details, snapResult.step, 400)
  }

  const { snapshot, pageCount, sectionCount } = snapResult

  if (process.env.NODE_ENV === 'development') {
    console.info('[website-publish]', {
      action:      'publish',
      tenantId,
      userId,
      pageCount,
      sectionCount,
      estimatedKb: snapResult.estimatedKb.toFixed(1),
      fromClient:  snapResult.fromClient,
    })
  }

  // Step 2: Get next version number
  const { data: nextNumData, error: nextNumErr } = await db.rpc('get_next_site_version_number', {
    p_tenant_id: tenantId,
  })
  if (nextNumErr) return fail('Failed to get version number', nextNumErr.message, 'version_number')
  const versionNumber = (nextNumData as number | null) ?? 1

  // Step 3: Insert checkpoint — STOP here if it fails
  const now = new Date().toISOString()
  const { data: versionRow, error: versionErr } = await db
    .from('site_versions')
    .insert({
      tenant_id:      tenantId,
      version_number: versionNumber,
      version_name:   `Published ${new Date().toLocaleDateString()}`,
      label:          `Published ${new Date().toLocaleDateString()}`,
      description:    'Created automatically on publish',
      status:         'draft',
      source:         'publish',
      snapshot,
      page_count:     pageCount,
      section_count:  sectionCount,
      created_by:     userId ?? null,
      published_at:   null,
      created_at:     now,
      updated_at:     now,
    })
    .select('id,version_number,label,source')
    .single()

  if (versionErr) {
    // Surface the exact Supabase error so the operator knows what to fix.
    // Common causes: FK violation on created_by (use auth_id not profile id),
    // CHECK constraint on source/status, UNIQUE conflict on version_number,
    // or RLS policy blocking the insert.
    const versionErrObj = versionErr as Record<string, unknown>
    console.error('[website-publish] version insert failed:', {
      code:    versionErrObj.code,
      message: versionErrObj.message,
      details: versionErrObj.details,
      hint:    versionErrObj.hint,
      tenantId,
      userId,
      versionNumber,
      source: 'publish',
      status: 'draft',
    })
    return NextResponse.json(
      {
        ok:    false,
        error: 'CHECKPOINT_SAVE_FAILED',
        message: 'Checkpoint save failed. Publish was aborted to protect data integrity.',
        checkpointError: {
          code:    versionErrObj.code    ?? null,
          message: versionErrObj.message ?? null,
          details: versionErrObj.details ?? null,
          hint:    versionErrObj.hint    ?? null,
        },
        fixHint: [
          'Verify site_versions.created_by uses auth.users.id (ctx.auth_id), not public.users.id (ctx.id)',
          'Check site_versions CHECK constraints for source/status values',
          'Check site_versions UNIQUE(tenant_id, version_number) is not violated',
          'Run GET /api/owner/diagnostics/website-publish for full diagnostics',
        ],
        step: 'version_insert',
      },
      { status: 500 },
    )
  }

  const versionId = versionRow.id as string

  // Step 4: Apply snapshot to live site_pages / site_sections
  const applyResult = await applySnapshotToWebsiteTables(tenantId, snapshot, userId ?? '')
  if (!applyResult.data) {
    return fail(
      'Failed to apply snapshot to live tables',
      applyResult.error ?? 'applySnapshotToWebsiteTables returned no data',
      'publish_apply',
    )
  }

  // Step 5: Archive old published versions
  await db
    .from('site_versions')
    .update({ status: 'archived' })
    .eq('tenant_id', tenantId)
    .eq('status', 'published')

  // Step 6: Mark this version as published
  await db
    .from('site_versions')
    .update({ status: 'published', published_at: now })
    .eq('id', versionId)

  // Step 7: Sync site_settings — copy design/template fields from snapshot
  // This is the critical step that was previously missing:
  // AI restyle, template apply, and design changes write to site_settings
  // directly, but the published state needs to capture them in the snapshot
  // settings object and write them back here.
  const snapshotSettings = (snapshot.settings ?? {}) as Record<string, unknown>

  const settingsUpdate: Record<string, unknown> = {
    tenant_id:      tenantId,
    is_published:   true,
    published_at:   now,
    last_published_version_id: versionId,
    has_unpublished_changes: false,
  }

  // Sync design fields from snapshot if present
  if (snapshotSettings.design_system && typeof snapshotSettings.design_system === 'object') {
    settingsUpdate.design_system = snapshotSettings.design_system
  }
  if (snapshotSettings.theme && typeof snapshotSettings.theme === 'object') {
    settingsUpdate.theme = snapshotSettings.theme
  }
  if (snapshotSettings.active_template_key) {
    settingsUpdate.active_template_key = snapshotSettings.active_template_key
  }
  if (snapshotSettings.active_template_id) {
    settingsUpdate.active_template_id = snapshotSettings.active_template_id
  }
  if (snapshotSettings.template_config && typeof snapshotSettings.template_config === 'object') {
    settingsUpdate.template_config = snapshotSettings.template_config
  }
  if (snapshotSettings.brand_colors && typeof snapshotSettings.brand_colors === 'object') {
    settingsUpdate.brand_colors = snapshotSettings.brand_colors
  }
  if (snapshotSettings.fonts && typeof snapshotSettings.fonts === 'object') {
    settingsUpdate.fonts = snapshotSettings.fonts
  }

  const { data: settings, error: settingsErr } = await db
    .from('site_settings')
    .upsert(settingsUpdate, { onConflict: 'tenant_id' })
    .select('*')
    .single()

  if (settingsErr) {
    // Don't fail — data is already published; just warn
    console.warn('[website-publish] site_settings update failed:', settingsErr.message)
  }

  // Step 8: Promote draft pages to published
  await db
    .from('site_pages')
    .update({ status: 'published', updated_at: now })
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')

  // Step 9: Mark draft as clean
  await db
    .from('website_builder_drafts')
    .upsert(
      { tenant_id: tenantId, dirty: false, draft_snapshot: snapshot, base_version_id: versionId },
      { onConflict: 'tenant_id' },
    )

  // Step 10: REVALIDATE — clear all Next.js cache for public routes
  // This is critical: without this, the public site may show stale content.
  revalidatePublicRoutes(tenantId, tenantSlug)

  // Log event (non-blocking)
  db.from('website_version_events').insert({
    tenant_id:  tenantId,
    version_id: versionId,
    event_type: 'published',
    metadata:   { pageCount, sectionCount, publishedAt: now },
    created_by: userId ?? null,
  }).then(() => null).catch(() => null)

  // Step 11: Post-publish verification
  const verificationWarnings: string[] = []
  try {
    const { data: verifiedSettings } = await db
      .from('site_settings')
      .select('is_published, active_template_key, published_at')
      .eq('tenant_id', tenantId)
      .maybeSingle() as { data: Record<string, unknown> | null; error: unknown }

    if (!verifiedSettings?.is_published) {
      verificationWarnings.push('WARNING: site_settings.is_published is still false after publish')
    }
    if (snapshotSettings.active_template_key && verifiedSettings?.active_template_key !== snapshotSettings.active_template_key) {
      verificationWarnings.push('WARNING: active_template_key mismatch after publish')
    }
  } catch {
    verificationWarnings.push('Could not verify publish state')
  }

  const liveUrl = tenantSlug ? `/sites/${tenantSlug}` : null

  return NextResponse.json({
    ok:          true,
    published:   true,
    versionId,
    versionNumber,
    pageCount,
    sectionCount,
    publishedAt: now,
    liveUrl,
    settings:    settings ?? null,
    warnings: [
      ...(snapResult.warnings.length > 0 ? snapResult.warnings : []),
      ...verificationWarnings,
    ].filter(Boolean),
  })
}

// ── Cache revalidation ────────────────────────────────────────────────────────

function revalidatePublicRoutes(tenantId: string, tenantSlug: string | null) {
  try {
    // Revalidate all possible public routes for this tenant
    revalidateTag(`website:${tenantId}`)
    revalidateTag(`website:${tenantId}:public`)
    revalidateTag(`tenant:${tenantId}`)

    if (tenantSlug) {
      revalidatePath(`/sites/${tenantSlug}`)
      revalidatePath(`/sites/${tenantSlug}/`)
      // Revalidate common page paths
      for (const slug of ['about', 'services', 'menu', 'shop', 'contact', 'faq', 'book', 'reviews']) {
        revalidatePath(`/sites/${tenantSlug}/${slug}`)
      }
      revalidateTag(`website:${tenantSlug}:public`)
      revalidateTag(`tenant:${tenantSlug}`)
    }

    // Revalidate dashboard website overview (so published_at shows updated)
    revalidatePath('/website')
  } catch (err) {
    // Non-fatal — log but don't fail publish
    console.warn('[website-publish] cache revalidation error:', err instanceof Error ? err.message : err)
  }
}
