// app/api/website/ai-images/test-apply/route.ts
// POST /api/website/ai-images/test-apply
// Applies any imageUrl to a website section without calling Imagen.
// Use this to prove section apply works independently of image generation.
// Protected: only owner/admin may call this route.
//
// Body: { tenantId: string, sectionId: string, imageUrl: string }

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { buildImageContentPatch, mergeImageIntoContent } from '@/lib/website-builder/imagePlacement'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: { tenantId?: string; sectionId?: string; imageUrl?: string; imageRole?: string }
  try {
    body = await req.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
  }

  const { tenantId, sectionId, imageUrl, imageRole = 'hero_background' } = body

  if (!sectionId) return NextResponse.json({ error: 'sectionId is required.' }, { status: 400 })
  if (!imageUrl)  return NextResponse.json({ error: 'imageUrl is required.' }, { status: 400 })

  const supabase = getSupabaseServerClient()

  // Build the query — require tenantId for owners, use ctx.tenant_id for admins
  const effectiveTenantId = tenantId ?? ctx.tenant_id ?? undefined

  const query = supabase
    .from('site_sections')
    .select('id, tenant_id, section_type, content, page_id')
    .eq('id', sectionId)

  if (effectiveTenantId) {
    query.eq('tenant_id', effectiveTenantId)
  }

  const { data: section, error: sectionErr } = await query.single()

  if (sectionErr || !section)
    return NextResponse.json({ error: `Section "${sectionId}" not found.` }, { status: 404 })

  const { contentPatch, placementDescription } = buildImageContentPatch(
    section.section_type,
    imageRole,
    imageUrl,
    'Test image applied via test-apply route',
    'test-plan-id',
  )

  const mergedContent = mergeImageIntoContent(
    section.content as Record<string, unknown>,
    contentPatch,
  )

  console.log('[AI-IMAGE][TEST-APPLY] applying image', {
    sectionId,
    sectionType: section.section_type,
    imageRole,
    imageUrl,
    contentPatch,
    placementDescription,
  })

  const { error: updateErr } = await supabase
    .from('site_sections')
    .update({ content: mergedContent as never, updated_at: new Date().toISOString() } as never)
    .eq('id', sectionId)
    .eq('tenant_id', section.tenant_id)

  if (updateErr) {
    console.error('[AI-IMAGE][TEST-APPLY] update failed', updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  console.log('[AI-IMAGE][TEST-APPLY] success', { sectionId, sectionType: section.section_type })

  return NextResponse.json({
    ok:                 true,
    sectionId,
    sectionType:        section.section_type,
    imageUrl,
    imageRole,
    placementDescription,
    contentPatch,
    updatedSectionContent: mergedContent,
    message: 'Image applied to section successfully.',
  })
}
