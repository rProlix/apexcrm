// app/api/website/draft/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getDraftSnapshot, updateDraftSnapshot, getCurrentWebsiteSnapshot } from '@/lib/website/versioning'
import type { WebsiteSnapshot } from '@/lib/website/versionTypes'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const result = await getDraftSnapshot(ctx.tenant_id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ snapshot: result.data })
}

export async function PUT(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })
  if (!ctx.id)    return NextResponse.json({ error: 'No user'   }, { status: 400 })

  const body = await req.json().catch(() => null)
  let snapshot: WebsiteSnapshot | null = body?.snapshot ?? null

  if (!snapshot) {
    // If no snapshot provided, capture current state
    const snapResult = await getCurrentWebsiteSnapshot(ctx.tenant_id)
    if (snapResult.error || !snapResult.data) {
      return NextResponse.json({ error: snapResult.error ?? 'Could not capture snapshot' }, { status: 500 })
    }
    snapshot = snapResult.data
  }

  const result = await updateDraftSnapshot(ctx.tenant_id, snapshot, ctx.id)
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ success: true })
}
