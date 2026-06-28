// app/api/website/canva/imports/[importId]/restore-pre-import/route.ts
// Restore the pre-import draft snapshot captured by a specific (or the latest)
// Canva import run.
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { undoCanvaImport } from '@/lib/website/canva/runs'

function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

function resolveTenantId(ctx: Awaited<ReturnType<typeof getUserContext>>, override?: string | null): string | null {
  if (!ctx) return null
  const hint = sanitizeTenantId(override)
  const self = sanitizeTenantId(ctx.tenant_id)
  if (ctx.role === 'owner') return hint ?? self
  if (self && hint && self !== hint) return null
  return self ?? hint
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ importId: string }> }) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const { importId } = await params
  const body = await req.json().catch(() => ({}))
  const tenantId = resolveTenantId(ctx, body.tenant_id ?? body.websiteId ?? null)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const result = await undoCanvaImport({
    tenantId,
    importId,
    runId: body.importRunId ?? null,
    userId: ctx.auth_id ?? ctx.id ?? null,
  })

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true, restored: 'pre_import_draft', publishRequired: true })
}
