// app/api/website/publish/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { publishTenantSite, unpublishTenantSite } from '@/lib/website/publishSite'
import { syncRegistryAfterPublish } from '@/lib/website/registry'
import type { ClientPageSections } from '@/lib/website/versionTypes'

function forbidden() { return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 }) }

/**
 * POST /api/website/publish — publish (or unpublish) the tenant builder site.
 * Thin wrapper over publishTenantSite() so the per-website publish endpoint and
 * the builder EditBar share ONE publish implementation.
 */
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  let body: Record<string, unknown>
  try { body = await req.json() } catch { body = {} }

  const isPublish = Boolean(body.publish)

  let tenantId: string | null = null
  const bodyTenantId = sanitizeTenantId(body.tenant_id)
  if (ctx.role === 'owner') {
    tenantId = bodyTenantId ?? sanitizeTenantId(ctx.tenant_id)
  } else {
    const fromCtx = sanitizeTenantId(ctx.tenant_id)
    if (fromCtx && bodyTenantId && fromCtx !== bodyTenantId) return forbidden()
    tenantId = fromCtx ?? bodyTenantId
  }
  if (!tenantId) return NextResponse.json({ ok: false, error: 'No tenant resolved', step: 'tenant' }, { status: 400 })

  if (!isPublish) {
    const result = await unpublishTenantSite(tenantId)
    await syncRegistryAfterPublish(tenantId, { published: false }).catch(() => null)
    if (!result.ok) return NextResponse.json(result, { status: 500 })
    return NextResponse.json({ ok: true, published: false })
  }

  const result = await publishTenantSite({
    tenantId,
    userId: ctx.auth_id ?? undefined,
    clientPageSections: body.clientPageSections as ClientPageSections | undefined,
    clientSnapshot: body.snapshot,
  })

  if (!result.ok) {
    const status = result.error === 'CHECKPOINT_SAVE_FAILED' ? 500 : (result.step === 'tenant' ? 400 : 500)
    return NextResponse.json(result, { status })
  }

  await syncRegistryAfterPublish(tenantId, {
    published: true, publishedAt: result.publishedAt ?? null, versionId: result.versionId ?? null,
  }).catch(() => null)

  return NextResponse.json(result)
}
