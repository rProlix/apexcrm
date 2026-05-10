// app/api/website/sections/[sectionId]/images/[imageId]/restore/route.ts
// POST — restores an archived generated image.
// Query params:
//   activate=true  also set as the active image after restoring

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { buildImageContentPatch, mergeImageIntoContent } from '@/lib/website-builder/imagePlacement'
import type { WebsiteGeneratedImage } from '@/lib/builder/api'

type RouteContext = {
  params: Promise<{ sectionId: string; imageId: string }>
}

function wsiFrom(supabase: ReturnType<typeof getSupabaseServerClient>) {
  return (supabase as unknown as {
    from: (t: 'website_section_images') => ReturnType<typeof supabase.from>
  }).from('website_section_images') as ReturnType<typeof supabase.from>
}

export async function POST(req: NextRequest, context: RouteContext) {
  const { sectionId, imageId } = await context.params

  const ctx = await getUserContext()
  if (!ctx?.tenant_id || !['owner', 'admin', 'staff'].includes(ctx.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const shouldActivate = searchParams.get('activate') === 'true'

  const supabase = getSupabaseServerClient()
  const tenantId = ctx.tenant_id

  const { data: imageData, error: imgErr } = await wsiFrom(supabase)
    .select('*')
    .eq('id', imageId)
    .eq('tenant_id', tenantId)
    .eq('section_id', sectionId)
    .single()

  if (imgErr || !imageData) {
    return NextResponse.json({ error: 'Image not found or access denied' }, { status: 404 })
  }

  const image = imageData as WebsiteGeneratedImage

  if (!image.is_archived) {
    return NextResponse.json({ error: 'Image is not archived.' }, { status: 422 })
  }

  let updatedSection = null

  if (shouldActivate) {
    // Deactivate all other images for same slot, then activate + restore this one
    await wsiFrom(supabase)
      .update({ is_active: false, status: 'generated', updated_at: new Date().toISOString() } as never)
      .eq('tenant_id', tenantId)
      .eq('section_id', sectionId)
      .eq('slot_key', image.slot_key)

    await wsiFrom(supabase)
      .update({ is_archived: false, is_active: true, status: 'active', updated_at: new Date().toISOString() } as never)
      .eq('id', imageId)

    const imageUrl = image.image_url || image.public_url || ''

    const { data: section } = await supabase
      .from('site_sections')
      .select('id, section_type, content')
      .eq('id', sectionId)
      .eq('tenant_id', tenantId)
      .single()

    if (section) {
      const sectionContent: Record<string, unknown> =
        section.content && typeof section.content === 'object' && !Array.isArray(section.content)
          ? (section.content as Record<string, unknown>)
          : {}

      const { contentPatch } = buildImageContentPatch(
        section.section_type,
        image.image_role ?? 'primary',
        imageUrl,
        image.alt_text ?? '',
        image.plan_id ?? '',
      )

      const merged = mergeImageIntoContent(sectionContent, contentPatch)

      const { data: updated } = await supabase
        .from('site_sections')
        .update({ content: merged as never, updated_at: new Date().toISOString() } as never)
        .eq('id', sectionId)
        .eq('tenant_id', tenantId)
        .select('id, section_type, content, is_visible, sort_order')
        .single()

      updatedSection = updated
    }
  } else {
    // Just restore without activating
    await wsiFrom(supabase)
      .update({ is_archived: false, status: 'generated', updated_at: new Date().toISOString() } as never)
      .eq('id', imageId)
  }

  const { data: restoredData } = await wsiFrom(supabase)
    .select('*')
    .eq('id', imageId)
    .single()

  return NextResponse.json({
    success:       true,
    restored:      (restoredData as WebsiteGeneratedImage | null),
    activated:     shouldActivate,
    updatedSection,
    sectionId,
    imageId,
  })
}

