// app/api/website/canva/pdf/convert/route.ts
// Runs the AI conversion of an uploaded Canva PDF into native NexoraNow event
// website sections, saved into the website's draft_config. Per-website only.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { convertCanvaPdfToDraft } from '@/lib/website/canva/pdfConvert'

function resolveTenantId(ctx: Awaited<ReturnType<typeof getUserContext>>, override?: string | null): string | null {
  if (!ctx) return null
  const hint = sanitizeTenantId(override)
  const self = sanitizeTenantId(ctx.tenant_id)
  if (ctx.role === 'owner') return hint ?? self
  if (self && hint && self !== hint) return null
  return self ?? hint
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const tenantId = resolveTenantId(ctx, (body.tenant_id as string) ?? null)
  if (!tenantId) return NextResponse.json({ ok: false, error: 'No tenant' }, { status: 400 })

  const websiteId = (body.websiteId as string) || ''
  const importId = (body.importId as string) || ''
  if (!websiteId || !importId) {
    return NextResponse.json({ ok: false, error: 'websiteId and importId are required.' }, { status: 400 })
  }

  const result = await convertCanvaPdfToDraft({ tenantId, websiteId, importId, createdBy: ctx.id ?? null })
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })

  return NextResponse.json({
    ok: true,
    websiteId,
    importId,
    draftPreviewUrl: result.draftPreviewUrl,
    liveUrl: result.liveUrl,
    sectionCount: result.sectionCount,
    pageCount: result.pageCount,
    animationMappingCount: result.animationMappingCount,
    eventMetadata: result.eventMetadata,
    warnings: result.warnings ?? [],
    publishAvailable: true,
  })
}
