// app/api/website/templates/[templateId]/preview/route.ts
// POST — returns a preview mapping of a template applied to the current tenant content
// Does NOT write any data.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { previewTemplate } from '@/lib/website/templates/applyTemplateToWebsite'
import { getTemplate } from '@/lib/website/templates/templateRegistry'

type RouteContext = { params: Promise<{ templateId: string }> }

export async function POST(req: NextRequest, context: RouteContext) {
  const { templateId } = await context.params
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  let pageId: string | null = null
  try {
    const body = await req.json()
    pageId = body.pageId ?? null
  } catch { /* no body required */ }

  const result = await previewTemplate(tenantId, templateId, pageId)
  if (!result.ok) {
    return NextResponse.json({ error: result.error ?? 'Preview failed' }, { status: 400 })
  }

  const template = getTemplate(templateId)

  return NextResponse.json({
    ok:       true,
    template: template ? {
      key:            template.key,
      name:           template.name,
      description:    template.description,
      layoutType:     template.layoutType,
      animationLevel: template.animationLevel,
      features:       template.features,
      bestFor:        template.bestFor,
      designSystem:   template.designSystem,
      previewGradient: template.previewGradient,
    } : null,
    mappings: result.mappings,
    message:  `Preview ready: ${result.mappings.filter((m) => m.hasContent).length} of ${result.mappings.length} slots will be filled with your existing content.`,
  })
}
