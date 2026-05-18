// app/api/website/draft/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import {
  getDraftSnapshot,
  updateDraftSnapshot,
  getCurrentWebsiteSnapshot,
} from '@/lib/website/versioning'
import type { WebsiteSnapshot } from '@/lib/website/versionTypes'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

/** GET /api/website/draft — returns the current builder draft snapshot */
export async function GET() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const result = await getDraftSnapshot(ctx.tenant_id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ snapshot: result.data })
}

/**
 * PUT /api/website/draft — saves a snapshot as the current draft.
 * Body: { snapshot: WebsiteSnapshot }
 * If no snapshot is provided, captures the current live state.
 */
export async function PUT(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const body = await req.json().catch(() => null)
  let snapshot: WebsiteSnapshot | null = body?.snapshot ?? null

  // Validate tenant ownership if snapshot is provided
  if (snapshot) {
    if (snapshot.tenantId && snapshot.tenantId !== ctx.tenant_id && ctx.role !== 'owner') {
      return NextResponse.json({ error: 'Snapshot tenant mismatch' }, { status: 403 })
    }
    // Ensure tenantId is always set correctly
    snapshot = { ...snapshot, tenantId: ctx.tenant_id }
  } else {
    // No snapshot provided — capture current state from DB
    const snapResult = await getCurrentWebsiteSnapshot(ctx.tenant_id)
    if (snapResult.error || !snapResult.data) {
      return NextResponse.json(
        { error: snapResult.error ?? 'Could not capture snapshot' },
        { status: 500 },
      )
    }
    snapshot = snapResult.data
  }

  // ctx.auth_id = auth.users UUID required by website_builder_drafts.updated_by FK
  const result = await updateDraftSnapshot(ctx.tenant_id, snapshot, ctx.auth_id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ success: true, dirty: true })
}
