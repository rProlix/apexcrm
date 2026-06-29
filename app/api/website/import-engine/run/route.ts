// app/api/website/import-engine/run/route.ts
// Universal AI Design Import Engine — run import from PDF, image, or URL input.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'
import { runDesignImportEngine, runDesignImportFromCanvaImportRecord } from '@/lib/website/import-engine/run-engine'
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

  const contentType = req.headers.get('content-type') ?? ''
  let tenantId: string | null = null
  let websiteId = ''
  let importId = ''
  let url: string | undefined
  let userPrompt: string | undefined
  let useExistingPdf = false

  if (contentType.includes('multipart/form-data')) {
    const fd = await req.formData()
    tenantId = resolveTenantId(ctx, (fd.get('tenant_id') as string) ?? null)
    websiteId = String(fd.get('websiteId') ?? '')
    importId = String(fd.get('importId') ?? '')
    url = (fd.get('url') as string) || undefined
    userPrompt = (fd.get('userPrompt') as string) || undefined
    useExistingPdf = fd.get('useExistingPdf') === 'true'

    if (useExistingPdf && websiteId && importId && tenantId) {
      try {
        const result = await runDesignImportFromCanvaImportRecord({
          tenantId, websiteId, importId, createdBy: ctx.id ?? null,
        })
        if (!result.ok) {
          const status = isMissingColumnError(result.error) ? 503 : 400
          return NextResponse.json({ ok: false, error: result.error, diagnostics: result.diagnostics }, { status })
        }
        return NextResponse.json({
          ok: true,
          websiteId,
          importId,
          draftPreviewUrl: result.draftPreviewUrl,
          liveUrl: result.liveUrl,
          reconstruction: result.reconstruction,
          extraction: result.extraction,
          diagnostics: result.diagnostics,
          publishAvailable: result.publishAvailable,
          sectionCount: result.sectionCount,
          pageCount: result.pageCount,
          renderedPageCount: result.renderedPageCount,
          linkMapping: result.linkMapping,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'import error'
        if (isMissingColumnError(message)) {
          return NextResponse.json({ ok: false, error: SCHEMA_MISSING_MESSAGE, hasRequiredSchema: false }, { status: 503 })
        }
        return NextResponse.json({ ok: false, error: message }, { status: 500 })
      }
    }

    const file = fd.get('file')
    if (file instanceof File && tenantId && websiteId && importId) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const mime = file.type || 'application/octet-stream'
      const isPdf = mime.includes('pdf') || file.name.toLowerCase().endsWith('.pdf')

      try {
        const result = await runDesignImportEngine({
          tenantId, websiteId, importId, createdBy: ctx.id ?? null,
          input: isPdf
            ? { pdfBuffer: buffer, fileName: file.name }
            : { imageBuffers: [{ buffer, mimeType: mime, fileName: file.name }] },
          options: { userPrompt },
        })
        if (!result.ok) return NextResponse.json({ ok: false, error: result.error, diagnostics: result.diagnostics }, { status: 400 })
        return NextResponse.json({
          ok: true,
          websiteId,
          importId,
          draftPreviewUrl: result.draftPreviewUrl,
          liveUrl: result.liveUrl,
          reconstruction: result.reconstruction,
          extraction: result.extraction,
          diagnostics: result.diagnostics,
          publishAvailable: result.publishAvailable,
          sectionCount: result.reconstruction?.pages.reduce((n, p) => n + p.sections.length, 0),
          pageCount: result.extraction?.pageCount,
          renderedPageCount: result.extraction?.renderedPages.length,
          linkMapping: result.reconstruction?.linkMapping,
        })
      } catch (e) {
        return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Import failed' }, { status: 500 })
      }
    }
  } else {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    tenantId = resolveTenantId(ctx, (body.tenant_id as string) ?? null)
    websiteId = String(body.websiteId ?? '')
    importId = String(body.importId ?? '')
    url = (body.url as string) || undefined
    userPrompt = (body.userPrompt as string) || undefined
    useExistingPdf = body.useExistingPdf === true
  }

  if (!tenantId) return NextResponse.json({ ok: false, error: 'No tenant' }, { status: 400 })
  if (!websiteId || !importId) {
    return NextResponse.json({ ok: false, error: 'websiteId and importId are required.' }, { status: 400 })
  }

  try {
    if (useExistingPdf) {
      const result = await runDesignImportFromCanvaImportRecord({
        tenantId, websiteId, importId, createdBy: ctx.id ?? null,
      })
      if (!result.ok) {
        const status = isMissingColumnError(result.error) ? 503 : 400
        const error = isMissingColumnError(result.error) ? SCHEMA_MISSING_MESSAGE : result.error
        return NextResponse.json({ ok: false, error, diagnostics: result.diagnostics }, { status })
      }
      return NextResponse.json({
        ok: true,
        websiteId,
        importId,
        draftPreviewUrl: result.draftPreviewUrl,
        liveUrl: result.liveUrl,
        reconstruction: result.reconstruction,
        extraction: result.extraction,
        diagnostics: result.diagnostics,
        publishAvailable: result.publishAvailable,
        sectionCount: result.sectionCount,
        pageCount: result.pageCount,
        renderedPageCount: result.renderedPageCount,
        linkMapping: result.linkMapping,
      })
    }

    if (url) {
      const result = await runDesignImportEngine({
        tenantId, websiteId, importId, createdBy: ctx.id ?? null,
        input: { url, fileName: url },
        options: { userPrompt },
      })
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error, diagnostics: result.diagnostics }, { status: 400 })
      return NextResponse.json({
        ok: true,
        websiteId,
        importId,
        draftPreviewUrl: result.draftPreviewUrl,
        liveUrl: result.liveUrl,
        reconstruction: result.reconstruction,
        extraction: result.extraction,
        diagnostics: result.diagnostics,
        publishAvailable: result.publishAvailable,
        sectionCount: result.reconstruction?.pages.reduce((n, p) => n + p.sections.length, 0),
        pageCount: result.extraction?.pageCount,
        renderedPageCount: result.extraction?.renderedPages.length,
        linkMapping: result.reconstruction?.linkMapping,
      })
    }

    return NextResponse.json({ ok: false, error: 'Provide url, file upload, or useExistingPdf.' }, { status: 400 })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'import error'
    if (isMissingColumnError(message)) {
      return NextResponse.json({ ok: false, error: SCHEMA_MISSING_MESSAGE, hasRequiredSchema: false }, { status: 503 })
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
