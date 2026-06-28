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
import { isMissingColumnError, SCHEMA_MISSING_MESSAGE } from '@/lib/website/canva/ensure-canva-import-schema'

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

  let result
  try {
    result = await convertCanvaPdfToDraft({ tenantId, websiteId, importId, createdBy: ctx.id ?? null })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'conversion error'
    if (isMissingColumnError(message)) {
      return NextResponse.json({ ok: false, error: SCHEMA_MISSING_MESSAGE, hasRequiredSchema: false }, { status: 503 })
    }
    return NextResponse.json({ ok: false, error: `AI conversion failed: ${message}` }, { status: 500 })
  }
  if (!result.ok) {
    const status = isMissingColumnError(result.error) ? 503 : 400
    const error = isMissingColumnError(result.error) ? SCHEMA_MISSING_MESSAGE : result.error
    return NextResponse.json({ ok: false, error }, { status })
  }

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
