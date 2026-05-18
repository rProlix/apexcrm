// app/api/website/versions/test/route.ts
// POST /api/website/versions/test
//
// Dry-run: builds a snapshot and validates it without inserting anything.
// Use this before publish or from the diagnostics UI to verify why checkpoints fail.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { createWebsiteSnapshotForTenant } from '@/lib/website/snapshot/createWebsiteSnapshotForTenant'
import type { ClientPageSections } from '@/lib/website/versionTypes'

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }
  if (!ctx.tenant_id) {
    return NextResponse.json({ ok: false, error: 'No tenant', step: 'tenant' }, { status: 400 })
  }

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* empty body is fine */ }

  const { snapshot: clientSnapshot, clientPageSections } = body as {
    snapshot?:           unknown
    clientPageSections?: ClientPageSections
  }

  const snapResult = await createWebsiteSnapshotForTenant({
    tenantId:            ctx.tenant_id,
    userId:              ctx.auth_id, // auth.users UUID, not profile UUID
    source:              'manual',
    clientSnapshot,
    clientPageSections,
    preferClientSnapshot: !!clientSnapshot,
  })

  if (!snapResult.ok) {
    return NextResponse.json({
      ok:      false,
      error:   snapResult.error,
      details: snapResult.details,
      step:    snapResult.step,
    }, { status: 400 })
  }

  return NextResponse.json({
    ok:             true,
    pageCount:      snapResult.pageCount,
    sectionCount:   snapResult.sectionCount,
    estimatedKb:    Math.round(snapResult.estimatedKb * 10) / 10,
    fromClient:     snapResult.fromClient,
    warnings:       snapResult.warnings,
    message:        'Snapshot is valid. Safe to create checkpoint.',
  })
}
