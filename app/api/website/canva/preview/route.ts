// app/api/website/canva/preview/route.ts
// Returns a non-persistent preview of how a Canva source would import, so the
// builder can show the user a summary before they apply it.
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { buildSafeCanvaIframe, validateCanvaEmbedInput } from '@/lib/website/canva/canva-embed'
import { convertCanvaHtml } from '@/lib/website/canva/convert'
import { CANVA_APPROXIMATION_NOTICE } from '@/lib/website/canva/types'

function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  let body: Record<string, unknown> = {}
  let html: string | null = null
  const contentType = req.headers.get('content-type') ?? ''
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData()
    for (const [k, v] of form.entries()) { if (typeof v === 'string') body[k] = v }
    const file = form.get('file')
    if (file && typeof file !== 'string') {
      const name = (file as File).name.toLowerCase()
      if (/\.(html?|htm)$/.test(name) || (file as File).type.includes('html') || (file as File).type.includes('text')) {
        html = await (file as File).text()
      }
    }
  } else {
    body = await req.json().catch(() => ({}))
    if (typeof body.html === 'string') html = body.html as string
  }

  const importMode = String(body.importMode ?? 'preserve')
  const canvaUrl = (body.canvaUrl as string) ?? null
  const embedCode = (body.embedCode as string) ?? null
  const isCustomCanvaDomain = Boolean(body.isCustomCanvaDomain)

  if (importMode === 'preserve') {
    const validation = validateCanvaEmbedInput(canvaUrl ?? embedCode, { allowCustomDomains: isCustomCanvaDomain })
    const valid = validation.ok
    const warnings: string[] = []
    if (!valid) {
      warnings.push(validation.reason ?? 'Provide a valid Canva published URL, embed code, canva.site link, or custom domain.')
    } else if (validation.validationMode === 'custom_domain') {
      warnings.push('Custom domain accepted. Embedding may fail if the domain blocks iframes — a fallback "Open Canva Website" button will be shown.')
    }
    return NextResponse.json({
      mode: 'preserve',
      valid,
      hostname: validation.hostname ?? null,
      validationMode: validation.validationMode ?? null,
      isCustomDomain: validation.validationMode === 'custom_domain',
      embedHtml: valid ? buildSafeCanvaIframe(canvaUrl ?? embedCode, { allowCustomDomains: isCustomCanvaDomain }) : null,
      animationPreservation: valid ? 'exact' : 'unknown',
      warnings,
    })
  }

  const result = convertCanvaHtml(html ?? '', { sourceUrl: canvaUrl })
  return NextResponse.json({
    mode: 'converted',
    valid: true,
    title: result.title,
    colors: result.colors,
    images: result.images.slice(0, 12),
    sectionCount: result.sections.length,
    animations: result.animations,
    animationPreservation: result.preservation,
    notice: CANVA_APPROXIMATION_NOTICE,
    warnings: result.warnings,
  })
}
