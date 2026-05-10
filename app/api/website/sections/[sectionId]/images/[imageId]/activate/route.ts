// POST /api/website/sections/[sectionId]/images/[imageId]/activate

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
  _req:    NextRequest,
  { params }: { params: Params | Promise<Params> },
) {
  const { sectionId, imageId } = await (params instanceof Promise ? params : Promise.resolve(params))

  const ctx = await getUserContext()
  if (!ctx?.tenant_id || !['owner','admin','staff'].includes(ctx.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase  = getSupabaseServerClient()
  const tenantId  = ctx.tenant_id

  // ── Fetch the target image ────────────────────────────────────────────────
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

  if (image.is_archived) {
    return NextResponse.json(
      { error: 'Cannot activate an archived image. Restore it first.' },
      { status: 422 },
    )
  }

  // ── Deactivate all other images for same slot ─────────────────────────────
  await wgiFrom(supabase)
    .update({ is_active: false, updated_at: new Date().toISOString() } as never)
    .eq('tenant_id', tenantId)
    .eq('section_id', sectionId)
    .eq('image_slot', image.image_slot)
    .neq('id', imageId)

  // ── Activate this image ───────────────────────────────────────────────────
  const { data: activatedData, error: activateErr } = await wgiFrom(supabase)
    .update({ is_active: true, updated_at: new Date().toISOString() } as never)
    .eq('id', imageId)
    .select('*')
    .single()

  if (activateErr || !activatedData) {
    return NextResponse.json({ error: 'Failed to activate image' }, { status: 500 })
  }

  const activated = activatedData as WebsiteGeneratedImage

  // ── Patch the live section content ────────────────────────────────────────
  const { data: section } = await supabase
    .from('site_sections')
    .select('id, section_type, content')
    .eq('id', sectionId)
    .eq('tenant_id', tenantId)
    .single()

  let updatedSection = null

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

  return NextResponse.json({
    success:        true,
    activated,
    updatedSection,
    sectionId,
    imageId,
    imageSlot:      image.image_slot,
    publicUrl:      image.public_url,
  })
}
