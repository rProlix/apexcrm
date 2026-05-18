// app/api/website/templates/[templateId]/apply/route.ts
// POST — applies a template to the tenant's draft website
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { resolveWebsiteTenantId } from '@/lib/website/resolveWebsiteTenant'
import { applyTemplateToWebsite } from '@/lib/website/templates/applyTemplateToWebsite'
import { revalidatePath } from 'next/cache'
import { getSupabaseServerClient } from '@/lib/supabase/server'

type RouteContext = { params: Promise<{ templateId: string }> }

export async function POST(req: NextRequest, context: RouteContext) {
  const { templateId } = await context.params
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = ctx.tenant_id ?? (await resolveWebsiteTenantId())
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  // Parse request body
  let preserveBrand        = false
  let preserveImages       = true
  let generateMissingImages = false
  let applyAnimations      = true
  let pageId: string | null = null

  try {
    const body = await req.json()
    if (typeof body.preserveBrand        === 'boolean') preserveBrand        = body.preserveBrand
    if (typeof body.preserveImages       === 'boolean') preserveImages       = body.preserveImages
    if (typeof body.generateMissingImages === 'boolean') generateMissingImages = body.generateMissingImages
    if (typeof body.applyAnimations      === 'boolean') applyAnimations      = body.applyAnimations
    if (typeof body.pageId               === 'string')  pageId               = body.pageId
  } catch { /* optional body */ }

  const result = await applyTemplateToWebsite({
    tenantId,
    templateKey:           templateId,
    preserveBrand,
    preserveImages,
    generateMissingImages,
    applyAnimations,
    pageId,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.message, code: result.error }, { status: 400 })
  }

  // Revalidate public site and dashboard preview
  try {
    const db = getSupabaseServerClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tenant } = await (db as any)
      .from('tenants')
      .select('slug')
      .eq('id', tenantId)
      .maybeSingle() as { data: { slug: string } | null; error: unknown }

    if (tenant?.slug) {
      revalidatePath(`/sites/${tenant.slug}`)
    }
  } catch { /* non-critical */ }

  revalidatePath('/website')

  return NextResponse.json({
    ok:                    true,
    templateApplicationId: result.templateApplicationId,
    beforeVersionId:       result.beforeVersionId,
    afterVersionId:        result.afterVersionId,
    sectionsUpdated:       result.sectionsUpdated,
    sectionsCreated:       result.sectionsCreated,
    previewUrl:            result.previewUrl,
    message:               result.message,
  })
}
