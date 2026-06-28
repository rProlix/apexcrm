// app/api/websites/canva/save-draft/route.ts
// Saves a Canva import into a REAL Invitation/Event website draft.
// Creates the website record (source='config', website_type='invitational') if
// none exists yet, then persists the embed into the website's draft_config.
// It never touches the business builder site.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { saveCanvaEventDraft } from '@/lib/website/canva/eventWebsite'
import { CANVA_IMPORT_MODES, type CanvaImportMode, type CanvaImportSettings } from '@/lib/website/canva/types'

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
  if (!tenantId) return NextResponse.json({ ok: false, error: 'No tenant for this account.' }, { status: 400 })

  const importMode = String(body.importMode ?? 'preserve') as CanvaImportMode
  if (!CANVA_IMPORT_MODES.includes(importMode)) {
    return NextResponse.json({ ok: false, error: 'Invalid import mode.' }, { status: 400 })
  }

  const result = await saveCanvaEventDraft({
    tenantId,
    websiteId: (body.websiteId as string) || null,
    name: (body.name as string) || null,
    slug: (body.publicSlug as string) || (body.slug as string) || null,
    sourceType: String(body.sourceType ?? 'canva_url'),
    importMode,
    canvaUrl: (body.canvaUrl as string) ?? null,
    embedCode: (body.embedCode as string) ?? null,
    isCustomDomain: Boolean(body.isCustomCanvaDomain ?? body.isCustomDomain),
    settings: (typeof body.settings === 'object' && body.settings ? (body.settings as Partial<CanvaImportSettings>) : undefined),
    povEnabled: Boolean(body.povEnabled),
    povEventId: (body.povEventId as string) ?? null,
    createdBy: ctx.id ?? null,
  })

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })

  return NextResponse.json({
    ok: true,
    websiteId: result.websiteId,
    websiteType: 'invitational',
    publicSlug: result.publicSlug,
    status: result.status,
    draftPreviewUrl: result.draftPreviewUrl,
    liveUrl: result.liveUrl,
    importId: result.importId,
    warnings: result.warnings ?? [],
  })
}
