// app/api/website/registry/[id]/archive/route.ts
// POST → archive (soft-delete) a website/app. Primary business site is protected.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { archiveWebsite } from '@/lib/website/registry'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const hint = sanitizeTenantId(body.tenant_id)
  const self = sanitizeTenantId(ctx.tenant_id)
  const tenantId = ctx.role === 'owner' ? (hint ?? self) : (self && hint && self !== hint ? null : self ?? hint)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const result = await archiveWebsite(tenantId, id)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
