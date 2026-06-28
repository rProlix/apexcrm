// app/api/website/registry/[id]/domain/route.ts
// POST → connect/normalize a custom domain or subdomain on a website (globally unique).
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { setWebsiteDomain } from '@/lib/website/registry'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await params
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const hint = sanitizeTenantId(body.tenant_id)
  const self = sanitizeTenantId(ctx.tenant_id)
  const tenantId = ctx.role === 'owner' ? (hint ?? self) : (self && hint && self !== hint ? null : self ?? hint)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const result = await setWebsiteDomain(tenantId, id, {
    custom_domain: body.custom_domain as string | null | undefined,
    subdomain: body.subdomain as string | null | undefined,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
