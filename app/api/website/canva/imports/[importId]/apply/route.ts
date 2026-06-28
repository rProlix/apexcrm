// app/api/website/canva/imports/[importId]/apply/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { applyCanvaImport } from '@/lib/website/canva/apply'
import { DEFAULT_CANVA_IMPORT_SETTINGS, type CanvaImportRow, type CanvaImportSettings } from '@/lib/website/canva/types'

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
  const tenantId = resolveTenantId(ctx, body.tenant_id ?? null)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any
  const { data: row } = await db.from('website_canva_imports').select('*').eq('id', importId).maybeSingle()
  if (!row || row.tenant_id !== tenantId) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  const settings: CanvaImportSettings = {
    ...DEFAULT_CANVA_IMPORT_SETTINGS,
    ...(typeof body.settings === 'object' && body.settings ? body.settings : {}),
    ...((row.import_summary?.settings ?? {}) as Partial<CanvaImportSettings>),
  }

  const result = await applyCanvaImport({
    tenantId,
    importRow: row as CanvaImportRow,
    settings,
    html: typeof body.html === 'string' ? body.html : null,
  })

  return NextResponse.json({
    ok: result.ok,
    mode: result.mode,
    sectionsWritten: result.sectionsWritten,
    animationPreservation: result.animationPreservation,
    warnings: result.warnings,
  })
}
