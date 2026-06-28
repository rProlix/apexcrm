// app/api/websites/[websiteId]/canva/rollback/route.ts
// Undo the last Canva draft change, or restore the last published version into
// the draft — scoped to THIS event website only (never the business site).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { rollbackCanvaEventWebsite } from '@/lib/website/canva/eventWebsite'

function resolveTenantId(ctx: Awaited<ReturnType<typeof getUserContext>>, override?: string | null): string | null {
  if (!ctx) return null
  const hint = sanitizeTenantId(override)
  const self = sanitizeTenantId(ctx.tenant_id)
  if (ctx.role === 'owner') return hint ?? self
  if (self && hint && self !== hint) return null
  return self ?? hint
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ websiteId: string }> }) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const { websiteId } = await params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const tenantId = resolveTenantId(ctx, (body.tenant_id as string) ?? null)
  if (!tenantId) return NextResponse.json({ ok: false, error: 'No tenant' }, { status: 400 })

  const action = body.action === 'restore-last-published' ? 'restore-last-published' : 'undo'
  const result = await rollbackCanvaEventWebsite({ tenantId, websiteId, action })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })

  return NextResponse.json({ ok: true, restored: result.restored, status: result.status })
}
