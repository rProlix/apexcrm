// app/api/website/canva/pdf/upload/route.ts
// Uploads a Canva PDF export, creates/uses a real Invitation/Event website
// record, stores the PDF privately, and creates a website_canva_imports row
// (source_type='pdf_upload'). Returns the websiteId + importId for conversion.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { uploadFile } from '@/lib/storage/uploadFile'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'
import { ensureCanvaEventWebsiteRecord } from '@/lib/website/canva/eventWebsite'
import { createPovEventRecord } from '@/lib/pov/createEvent'
import { estimatePdfPageCount, normalizeConversionStyle } from '@/lib/website/canva/pdfConvert'
import { normalizeAnimationLevel } from '@/lib/website/canva/pdf-animation-recreator'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

const MAX_PDF_BYTES = 25 * 1024 * 1024 // 25 MB (document-assets limit)

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

  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ ok: false, error: 'Upload must be multipart/form-data with a PDF file.' }, { status: 400 })
  }

  const form = await req.formData()
  const tenantId = resolveTenantId(ctx, (form.get('tenant_id') as string) ?? null)
  if (!tenantId) return NextResponse.json({ ok: false, error: 'No tenant for this account.' }, { status: 400 })

  const file = form.get('file')
  if (!file || typeof file === 'string') {
    return NextResponse.json({ ok: false, error: 'A PDF file is required.' }, { status: 400 })
  }
  const f = file as File
  const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name)
  if (!isPdf) return NextResponse.json({ ok: false, error: 'Only PDF files are accepted. Export your Canva design as a PDF.' }, { status: 400 })
  if (f.size === 0) return NextResponse.json({ ok: false, error: 'The PDF file is empty.' }, { status: 400 })
  if (f.size > MAX_PDF_BYTES) return NextResponse.json({ ok: false, error: 'PDF is too large (max 25 MB).' }, { status: 413 })

  const websiteName = ((form.get('websiteName') as string) || '').trim()
  const publicSlug = ((form.get('publicSlug') as string) || '').trim() || null
  const povEnabled = String(form.get('povEnabled') ?? '') === 'true'
  const conversionStyle = normalizeConversionStyle(form.get('conversionStyle'))
  const animationRecreationLevel = normalizeAnimationLevel(form.get('animationRecreationLevel'))
  let websiteId = ((form.get('websiteId') as string) || '').trim() || null

  const db = getSupabaseServerClient() as DB

  // 1. Optionally create a POV event (so camera/gallery routes exist).
  let povEventId: string | null = null
  if (povEnabled && !websiteId) {
    const pov = await createPovEventRecord({
      tenantId,
      name: websiteName || 'Imported Canva Event Website',
      websiteType: 'invitational',
      createdBy: ctx.id ?? null,
      event_type: (form.get('eventType') as string) || 'other',
      gallery_reveal_at: (form.get('galleryRevealAt') as string) || null,
    })
    if (pov.event) povEventId = pov.event.id as string
  }

  // 2. Ensure a real, separate Invitation/Event website record.
  const ensured = await ensureCanvaEventWebsiteRecord({
    tenantId, websiteId, name: websiteName || null, slug: publicSlug,
    povEnabled, povEventId, createdBy: ctx.id ?? null,
  })
  if (!ensured.ref) return NextResponse.json({ ok: false, error: ensured.error ?? 'Could not create the event website record.' }, { status: 400 })
  websiteId = ensured.ref.websiteId

  // 3. Store the PDF privately (document-assets bucket).
  let pdfPath: string
  let pageCount = 1
  try {
    const buf = Buffer.from(await f.arrayBuffer())
    pageCount = estimatePdfPageCount(buf)
    const ts = Date.now()
    const result = await uploadFile({
      bucket: STORAGE_BUCKETS.DOCUMENT_ASSETS,
      tenantId,
      pathParts: ['website-builder', 'canva-pdf-imports', websiteId],
      fileName: `${ts}-${f.name || 'canva-export.pdf'}`,
      buffer: buf,
      mimeType: 'application/pdf',
    })
    pdfPath = result.path
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Failed to upload PDF: ${e instanceof Error ? e.message : 'storage error'}` }, { status: 500 })
  }

  // 4. Create the import row (source_type='pdf_upload', import_mode='converted').
  let importId: string | null = null
  try {
    const { data: imp, error: impErr } = await db.from('website_canva_imports').insert({
      tenant_id: tenantId,
      business_id: null,
      website_id: websiteId,
      pov_event_id: povEventId,
      source_type: 'pdf_upload',
      import_mode: 'converted',
      status: 'importing',
      bucket: STORAGE_BUCKETS.DOCUMENT_ASSETS,
      storage_path: pdfPath,
      pdf_storage_path: pdfPath,
      pdf_file_name: f.name || 'canva-export.pdf',
      pdf_page_count: pageCount,
      ai_conversion_status: 'not_started',
      import_summary: { conversionStyle, animationRecreationLevel, povEnabled },
      warnings: [],
      created_by: ctx.id ?? null,
    }).select('id').single()
    if (impErr) return NextResponse.json({ ok: false, error: `Failed to create Canva import row: ${impErr.message}` }, { status: 500 })
    importId = imp?.id ?? null
  } catch (e) {
    return NextResponse.json({ ok: false, error: `Failed to create Canva import row: ${e instanceof Error ? e.message : 'database error'}` }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    websiteId,
    importId,
    publicSlug: ensured.ref.publicSlug,
    pdfStoragePath: pdfPath,
    pdfPageCount: pageCount,
    povEventId,
    status: 'importing',
    convertEndpoint: '/api/website/canva/pdf/convert',
  })
}
