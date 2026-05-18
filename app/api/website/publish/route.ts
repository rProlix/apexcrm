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
 *   1. Build snapshot from client / draft / live tables
 *   2. Save as draft (dirty=false after this)
 *   3. Insert a "publish" site_versions checkpoint
 *   4. STOP HERE if checkpoint fails — never publish from unknown state
 *   5. Apply snapshot to live site_pages / site_sections
 *   6. Archive old published versions
 *   7. Mark this version as published
 *   8. Set site_settings.is_published = true
 *
 * Unpublish (publish: false):
 *   - Only updates site_settings.is_published = false
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

  // ── UNPUBLISH path ────────────────────────────────────────────────────────
  if (!isPublish) {
    const { data: settings, error: settingsErr } = await db
      .from('site_settings')
      .upsert({ tenant_id: tenantId, is_published: false }, { onConflict: 'tenant_id' })
      .select('*')
      .single()
    if (settingsErr) return fail(settingsErr.message, undefined, 'settings_update')
    return NextResponse.json({ ok: true, published: false, settings })
  }

  // ── PUBLISH path ──────────────────────────────────────────────────────────
  const userId = ctx.id ?? undefined

  // Extract optional client sections from request body
  const clientPageSections = body.clientPageSections as ClientPageSections | undefined
  const clientSnapshot     = body.snapshot

  // Step 1: Build snapshot
  const snapResult = await createWebsiteSnapshotForTenant({
    tenantId,
    userId,
    source:              'publish',
    clientSnapshot,
    clientPageSections,
    preferClientSnapshot: !!clientSnapshot,
  })

  if (!snapResult.ok) {
    return fail(snapResult.error, snapResult.details, snapResult.step, 400)
  }

  const { snapshot, pageCount, sectionCount } = snapResult

  if (process.env.NODE_ENV === 'development') {
    console.info('[website-versioning]', {
      action:       'publish',
      tenantId,
      userId,
      source:       'publish',
      pageCount,
      sectionCount,
      estimatedKb:  snapResult.estimatedKb.toFixed(1),
      fromClient:   snapResult.fromClient,
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
      status:         'draft', // will be updated to 'published' in step 7
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
    // Checkpoint failed — DO NOT proceed with publish
    return fail(
      'Checkpoint save failed — publish aborted',
      versionErr.message,
      'version_insert',
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

  // Step 7: Update site_settings
  const { data: settings, error: settingsErr } = await db
    .from('site_settings')
    .upsert({ tenant_id: tenantId, is_published: true }, { onConflict: 'tenant_id' })
    .select('*')
    .single()

  if (settingsErr) {
    // Don't fail — data is already published; just warn
    console.warn('[website-publish] site_settings update failed:', settingsErr.message)
  }

  // Step 8: Promote draft pages to published
  await db
    .from('site_pages')
    .update({ status: 'published' })
    .eq('tenant_id', tenantId)
    .eq('status', 'draft')

  // Step 9: Mark draft as clean
  await db
    .from('website_builder_drafts')
    .upsert(
      { tenant_id: tenantId, dirty: false, draft_snapshot: snapshot, base_version_id: versionId },
      { onConflict: 'tenant_id' },
    )

  // Log event (non-blocking)
  db.from('website_version_events').insert({
    tenant_id:  tenantId,
    version_id: versionId,
    event_type: 'published',
    metadata:   {
      pageCount,
      sectionCount,
      publishedAt: now,
    },
    created_by: userId ?? null,
  }).then(() => null).catch(() => null)

  return NextResponse.json({
    ok:          true,
    published:   true,
    versionId,
    versionNumber,
    pageCount,
    sectionCount,
    settings:    settings ?? null,
    warnings:    snapResult.warnings.length > 0 ? snapResult.warnings : undefined,
  })
}
