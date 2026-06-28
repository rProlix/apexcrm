// app/api/website/registry/route.ts
// GET  → list the tenant's websites/apps (registry self-heals).
// POST → create a new builder-backed (business/creative) website record.
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { listWebsites, createBuilderWebsite, type WebsiteType } from '@/lib/website/registry'

function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

function resolveTenantId(ctx: Awaited<ReturnType<typeof getUserContext>>, override?: string | null): string | null {
  if (!ctx) return null
  const hint = sanitizeTenantId(override)
  const self = sanitizeTenantId(ctx.tenant_id)
  if (ctx.role === 'owner') return hint ?? self
  if (self && hint && self !== hint) return null
  return self ?? hint
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin', 'staff'].includes(ctx.role)) return forbidden()
  const tenantId = resolveTenantId(ctx, req.nextUrl.searchParams.get('tenant_id'))
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const websites = await listWebsites(tenantId, { includeArchived: req.nextUrl.searchParams.get('archived') === '1' })
  return NextResponse.json({ websites })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tenantId = resolveTenantId(ctx, body.tenant_id as string | undefined)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const websiteType = (['business', 'creative'].includes(body.website_type as string)
    ? body.website_type : 'business') as WebsiteType

  const result = await createBuilderWebsite({
    tenantId,
    websiteType,
    name: String(body.name ?? '').trim(),
    slug: String(body.slug ?? body.public_slug ?? ''),
    createdBy: ctx.id ?? null,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ website: result.website }, { status: 201 })
}
