// app/api/websites/[websiteId]/publish/route.ts
// Publishes ONE website/app by id — never the whole business. A business site
// publish never touches an event site and vice-versa.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { publishWebsiteById } from '@/lib/website/registry'

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
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })

  const { websiteId } = await params
  const body = await req.json().catch(() => ({}))
  const tenantId = resolveTenantId(ctx, body.tenant_id)
  if (!tenantId) return NextResponse.json({ ok: false, error: 'No tenant' }, { status: 400 })

  const result = await publishWebsiteById(tenantId, websiteId, ctx.auth_id ?? null)
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })

  return NextResponse.json({
    ok: true, published: true, status: result.status,
    liveUrl: result.liveUrl, publishedAt: result.publishedAt,
  })
}
