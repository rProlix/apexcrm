// app/api/website/[websiteId]/restore-last-published/route.ts
// Copies the last published snapshot back into the draft (does NOT publish).
// websiteId is the tenant-scoped website identifier (tenant_id in the current
// single-site-per-tenant model).
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { restoreLastPublished } from '@/lib/website/canva/runs'

function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

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
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const { websiteId } = await params
  const tenantId = resolveTenantId(ctx, websiteId)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const result = await restoreLastPublished({ tenantId, userId: ctx.auth_id ?? ctx.id ?? null })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, restored: 'last_published', publishRequired: true })
}
