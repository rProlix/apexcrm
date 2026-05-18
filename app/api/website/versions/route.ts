// app/api/website/versions/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getWebsiteVersions } from '@/lib/website/versioning'
import { createWebsiteSnapshotForTenant } from '@/lib/website/snapshot/createWebsiteSnapshotForTenant'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { WebsiteVersionSource, ClientPageSections } from '@/lib/website/versionTypes'

function forbidden() {
  return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
}

function structuredError(
  error: string,
  details?: string,
  step?: string,
  status = 500,
) {
  return NextResponse.json({ ok: false, error, details, step }, { status })
}

// ── GET /api/website/versions ─────────────────────────────────────────────────

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return structuredError('No tenant', undefined, 'tenant', 400)

  const result = await getWebsiteVersions(ctx.tenant_id)
  if (result.error) return structuredError(result.error, undefined, 'fetch')

  return NextResponse.json({ ok: true, versions: result.data ?? [] })
}

// ── POST /api/website/versions ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return structuredError('No tenant', undefined, 'tenant', 400)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const {
    label,
    description,
    source,
    clientPageSections,
    snapshot:     clientSnapshot,
    preferClientSnapshot,
  } = body as {
    label?:               string
    description?:         string
    source?:              WebsiteVersionSource
    clientPageSections?:  ClientPageSections
    snapshot?:            unknown
    preferClientSnapshot?: boolean
  }

  const safeSource: WebsiteVersionSource =
    ['manual','autosave','ai_autofill','ai_images','ai_animations','restore','publish','drag_drop','section_edit'].includes(source ?? '')
      ? (source as WebsiteVersionSource)
      : 'manual'

  // ── Step: build snapshot ──────────────────────────────────────────────────
  // Use ctx.auth_id (auth.users UUID) — NOT ctx.id (public.users profile UUID).
  // site_versions.created_by REFERENCES auth.users(id), so passing ctx.id
  // causes a FK violation and "Checkpoint save failed" error.
  const authUserId = ctx.auth_id ?? undefined

  const snapResult = await createWebsiteSnapshotForTenant({
    tenantId:            ctx.tenant_id,
    userId:              authUserId,
    source:              safeSource,
    clientSnapshot,
    clientPageSections,
    preferClientSnapshot: preferClientSnapshot ?? !!clientSnapshot,
  })

  if (!snapResult.ok) {
    return structuredError(snapResult.error, snapResult.details, snapResult.step, 400)
  }

  if (process.env.NODE_ENV === 'development') {
    console.info('[website-versioning]', {
      action:       'create_checkpoint',
      tenantId:     ctx.tenant_id,
      authUserId,
      source:       safeSource,
      pageCount:    snapResult.pageCount,
      sectionCount: snapResult.sectionCount,
      fromClient:   snapResult.fromClient,
      estimatedKb:  snapResult.estimatedKb.toFixed(1),
      warnings:     snapResult.warnings,
    })
  }

  // ── Step: get next version number ─────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any
  const { data: nextNumData, error: nextNumErr } = await db.rpc('get_next_site_version_number', {
    p_tenant_id: ctx.tenant_id,
  })
  if (nextNumErr) {
    return structuredError('Failed to get version number', nextNumErr.message, 'version_number')
  }
  const versionNumber = (nextNumData as number | null) ?? 1

  // ── Step: insert into site_versions ───────────────────────────────────────
  const now = new Date().toISOString()
  const { data: inserted, error: insertErr } = await db
    .from('site_versions')
    .insert({
      tenant_id:                ctx.tenant_id,
      version_number:           versionNumber,
      version_name:             label ?? 'Manual checkpoint',
      label:                    label ?? 'Manual checkpoint',
      description:              description ?? null,
      status:                   'draft',
      source:                   safeSource,
      snapshot:                 snapResult.snapshot,
      page_count:               snapResult.pageCount,
      section_count:            snapResult.sectionCount,
      created_by:               authUserId ?? null,
      restored_from_version_id: null,
      published_at:             null,
      created_at:               now,
      updated_at:               now,
    })
    .select('id,version_number,label,source,status,page_count,section_count,created_at')
    .single()

  if (insertErr) {
    const e = insertErr as Record<string, unknown>
    console.error('[website-versioning] site_versions insert failed:', {
      code:    e.code,
      message: e.message,
      details: e.details,
      hint:    e.hint,
      tenantId: ctx.tenant_id,
      authUserId,
      versionNumber,
      source: safeSource,
    })
    return NextResponse.json(
      {
        ok:    false,
        error: 'CHECKPOINT_SAVE_FAILED',
        message: 'Checkpoint save failed.',
        checkpointError: {
          code:    e.code    ?? null,
          message: e.message ?? null,
          details: e.details ?? null,
          hint:    e.hint    ?? null,
        },
        fixHint: 'Ensure created_by uses auth.users.id (ctx.auth_id). Run /api/owner/diagnostics/website-publish for details.',
        step: 'version_insert',
      },
      { status: 500 },
    )
  }

  // ── Step: log version event (non-blocking — never fail checkpoint for this) ─
  db.from('website_version_events').insert({
    tenant_id:  ctx.tenant_id,
    version_id: inserted.id,
    event_type: 'created',
    metadata: {
      source:            safeSource,
      pageCount:         snapResult.pageCount,
      sectionCount:      snapResult.sectionCount,
      estimatedKb:       snapResult.estimatedKb,
      fromClientSnapshot: snapResult.fromClient,
      warnings:          snapResult.warnings,
    },
    created_by: authUserId ?? null,
  })
  .then(() => null)
  .catch((e: unknown) =>
    console.warn('[website-versioning] event insert failed (non-fatal):', e instanceof Error ? e.message : e)
  )

  return NextResponse.json({
    ok:      true,
    version: inserted,
    warnings: snapResult.warnings.length > 0 ? snapResult.warnings : undefined,
  }, { status: 201 })
}
