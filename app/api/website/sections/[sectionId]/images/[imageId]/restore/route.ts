// POST /api/website/sections/[sectionId]/images/[imageId]/restore
// Query params: activate=true  to also activate after restoring

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { buildImageContentPatch, mergeImageIntoContent } from '@/lib/website-builder/imagePlacement'
import type { WebsiteGeneratedImage } from '@/lib/builder/api'

type Params = { sectionId: string; imageId: string }

function wgiFrom(supabase: ReturnType<typeof getSupabaseServerClient>) {
  return (supabase as unknown as {
    from: (t: 'website_generated_images') => ReturnType<typeof supabase.from>
  }).from('website_generated_images') as ReturnType<typeof supabase.from>
}

export async function POST(
  req:     NextRequest,
  { params }: { params: Params | Promise<Params> },
) {
  const { sectionId, imageId } = await (params instanceof Promise ? params : Promise.resolve(params))

  const ctx = await getUserContext()
  if (!ctx?.tenant_id || !['owner','admin','staff'].includes(ctx.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const shouldActivate = searchParams.get('activate') === 'true'

  const supabase = getSupabaseServerClient()
  const tenantId = ctx.tenant_id

  const { data: imageData, error: imgErr } = await wgiFrom(supabase)
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
    await wgiFrom(supabase)
      .update({ is_active: false, updated_at: new Date().toISOString() } as never)
      .eq('tenant_id', tenantId)
      .eq('section_id', sectionId)
      .eq('image_slot', image.image_slot)

    await wgiFrom(supabase)
      .update({ is_archived: false, is_active: true, updated_at: new Date().toISOString() } as never)
      .eq('id', imageId)

    const { data: section } = await supabase
      .from('site_sections')
      .select('id, section_type, content')
      .eq('id', sectionId)
      .eq('tenant_id', tenantId)
      .single()

    if (section) {
      const sectionContent: Record<string, unknown> =
        section.content && typeof section.content === 'object' && !Array.isArray(section.content)
          ? section.content as Record<string, unknown>
          : {}

      const { contentPatch } = buildImageContentPatch(
        section.section_type,
        image.image_role ?? 'primary',
        image.public_url,
        image.alt_text ?? '',
        image.image_plan_id ?? '',
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
    await wgiFrom(supabase)
      .update({ is_archived: false, updated_at: new Date().toISOString() } as never)
      .eq('id', imageId)
  }

  const { data: restoredData } = await wgiFrom(supabase)
    .select('*')
    .eq('id', imageId)
    .single()

  return NextResponse.json({
    success:       true,
    restored:      restoredData as WebsiteGeneratedImage | null,
    activated:     shouldActivate,
    updatedSection,
    sectionId,
    imageId,
  })
}
