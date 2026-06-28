// app/api/website/canva/import/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { validateCanvaEmbedInput } from '@/lib/website/canva/canva-embed'
import { applyCanvaImportWithRun } from '@/lib/website/canva/runs'
import {
  CANVA_SOURCE_TYPES, CANVA_IMPORT_MODES, DEFAULT_CANVA_IMPORT_SETTINGS,
  type CanvaImportRow, type CanvaImportSettings, type CanvaSourceType, type CanvaImportMode,
} from '@/lib/website/canva/types'

function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

function resolveTenantId(ctx: Awaited<ReturnType<typeof getUserContext>>, override?: string | null): string | null {
  if (!ctx) return null
  const hint = sanitizeTenantId(override)
  const self = sanitizeTenantId(ctx.tenant_id)
  if (ctx.role === 'owner') return hint ?? self
  if (self && hint && self !== hint) return null
  return self ?? hint
}

const MAX_HTML_BYTES = 5 * 1024 * 1024 // 5 MB of HTML

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  // Accept both multipart (with uploaded HTML/asset) and JSON.
  let body: Record<string, unknown> = {}
  let html: string | null = null
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') body[k] = v
    }
    const file = form.get('file')
    if (file && typeof file !== 'string') {
      if (file.size > MAX_HTML_BYTES) {
        return NextResponse.json({ error: 'Uploaded file is too large (max 5 MB).' }, { status: 413 })
      }
      const name = (file as File).name.toLowerCase()
      if (/\.(html?|htm)$/.test(name) || (file as File).type.includes('html') || (file as File).type.includes('text')) {
        html = await (file as File).text()
      } else {
        // ZIP / asset uploads are accepted but not parsed in v1.
        body.unparsedUpload = name
      }
    }
    if (typeof body.settings === 'string') {
      try { body.settings = JSON.parse(body.settings as string) } catch { /* ignore */ }
    }
  } else {
    body = await req.json()
    if (typeof body.html === 'string') html = body.html as string
  }

  const tenantId = resolveTenantId(ctx, (body.tenant_id as string) ?? null)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const sourceType = String(body.sourceType ?? '') as CanvaSourceType
  const importMode = String(body.importMode ?? '') as CanvaImportMode
  const canvaUrl   = (body.canvaUrl as string)  ?? null
  const embedCode  = (body.embedCode as string) ?? null
  const websiteId  = (body.websiteId as string) || tenantId
  const povEventId = (body.povEventId as string) ?? null
  const isCustomCanvaDomain = Boolean(body.isCustomCanvaDomain)

  if (!CANVA_SOURCE_TYPES.includes(sourceType)) {
    return NextResponse.json({ error: 'Invalid sourceType' }, { status: 400 })
  }
  if (!CANVA_IMPORT_MODES.includes(importMode)) {
    return NextResponse.json({ error: 'Invalid importMode' }, { status: 400 })
  }

  const settings: CanvaImportSettings = {
    ...DEFAULT_CANVA_IMPORT_SETTINGS,
    ...(typeof body.settings === 'object' && body.settings ? body.settings as Partial<CanvaImportSettings> : {}),
  }

  // Preserve mode requires a valid Canva URL/embed (canva.com, canva.site, or a
  // custom domain when the user confirmed it).
  let sourceDomain: string | null = null
  let validationMode: string | null = null
  if (importMode === 'preserve') {
    const validation = validateCanvaEmbedInput(canvaUrl ?? embedCode, { allowCustomDomains: isCustomCanvaDomain })
    if (!validation.ok) {
      return NextResponse.json({
        error: validation.reason
          ?? 'Preserve Canva Mode needs a valid Canva published URL, Canva embed code, canva.site link, or a custom domain connected to your Canva website.',
      }, { status: 400 })
    }
    sourceDomain = validation.hostname ?? null
    validationMode = validation.validationMode ?? null
  }
  // Converted mode without HTML still works (best-effort) but warn.
  const earlyWarnings: string[] = []
  if (importMode === 'converted' && !html) {
    earlyWarnings.push('No HTML export was provided. Sections were scaffolded; upload a Canva HTML export for richer conversion, or use Preserve Canva Mode.')
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any

  const { data: row, error } = await db.from('website_canva_imports').insert({
    tenant_id: tenantId,
    business_id: null,
    website_id: websiteId,
    pov_event_id: povEventId,
    source_type: sourceType,
    import_mode: importMode,
    source_url: canvaUrl,
    embed_code: embedCode,
    source_domain: sourceDomain,
    is_custom_domain: validationMode === 'custom_domain',
    validation_mode: validationMode,
    bucket: null,
    storage_path: null,
    status: 'importing',
    import_summary: {
      receivedHtmlBytes: html ? html.length : 0,
      settings,
      sourceDomain,
      isCustomCanvaDomain: validationMode === 'custom_domain',
      canvaValidationMode: validationMode,
    },
    warnings: earlyWarnings,
    created_by: ctx.id ?? null,
  }).select('*').single()

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? 'Could not create import' }, { status: 500 })
  }

  const { apply, runId } = await applyCanvaImportWithRun({
    tenantId,
    importRow: row as CanvaImportRow,
    settings,
    html,
    allowCustomDomains: validationMode === 'custom_domain',
    createdBy: ctx.id ?? null,
  })

  // Merge warnings onto the row.
  const allWarnings = [...earlyWarnings, ...apply.warnings]
  try {
    await db.from('website_canva_imports').update({
      warnings: allWarnings,
      import_summary: { ...(row.import_summary ?? {}), sectionsWritten: apply.sectionsWritten, applied: apply.ok },
    }).eq('id', row.id)
  } catch { /* ignore */ }

  return NextResponse.json({
    importId: row.id,
    runId,
    mode: importMode,
    status: apply.mode === 'preserve' ? 'embedded' : 'converted',
    animationPreservation: apply.animationPreservation,
    sectionsWritten: apply.sectionsWritten,
    appliedToDraft: true,
    publishRequired: true,
    undoAvailable: !!runId,
    warnings: allWarnings,
  })
}
