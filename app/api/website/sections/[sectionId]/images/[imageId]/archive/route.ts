// POST /api/website/sections/[sectionId]/images/[imageId]/archive
// Query params: force=true  to archive even if it's the only image

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
  const force = searchParams.get('force') === 'true'

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

  const image     = imageData as WebsiteGeneratedImage
  const wasActive = image.is_active

  if (wasActive && !force) {
    const { data: others } = await wgiFrom(supabase)
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('section_id', sectionId)
      .eq('image_slot', image.image_slot)
      .eq('is_archived', false)
      .neq('id', imageId)
      .limit(1)

    if (!others || (others as unknown[]).length === 0) {
      return NextResponse.json(
        {
          error: 'This is the only active image for this slot. Use force=true to archive anyway, or generate a new image first.',
          code:  'ONLY_ACTIVE_IMAGE',
        },
        { status: 422 },
      )
    }
  }

  await wgiFrom(supabase)
    .update({ is_archived: true, is_active: false, updated_at: new Date().toISOString() } as never)
    .eq('id', imageId)

  let newActive = null
  let updatedSection = null

  if (wasActive) {
    const { data: nextData } = await wgiFrom(supabase)
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('section_id', sectionId)
      .eq('image_slot', image.image_slot)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (nextData) {
      const next = nextData as WebsiteGeneratedImage

      await wgiFrom(supabase)
        .update({ is_active: true, updated_at: new Date().toISOString() } as never)
        .eq('id', next.id)

      newActive = next

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
          next.image_role ?? 'primary',
          next.public_url,
          next.alt_text ?? '',
          next.image_plan_id ?? '',
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
    }
  }

  return NextResponse.json({
    success: true,
    archived: imageId,
    newActive,
    updatedSection,
    sectionId,
  })
}
