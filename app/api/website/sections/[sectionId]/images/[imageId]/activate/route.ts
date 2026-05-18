// app/api/website/sections/[sectionId]/images/[imageId]/activate/route.ts
// POST — deactivates all other images for the same slot, activates this one,
//         and patches the live site_section content with the selected image URL.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { buildImageContentPatch, mergeImageIntoContent } from '@/lib/website-builder/imagePlacement'
import { getCurrentWebsiteSnapshot, updateDraftSnapshot } from '@/lib/website/versioning'
import { normalizeSnapshotForInsert } from '@/lib/website/snapshot/safeJson'
import type { WebsiteGeneratedImage } from '@/lib/builder/api'

type RouteContext = {
  params: Promise<{ sectionId: string; imageId: string }>
}

function wsiFrom(supabase: ReturnType<typeof getSupabaseServerClient>) {
  return (supabase as unknown as {
    from: (t: 'website_section_images') => ReturnType<typeof supabase.from>
  }).from('website_section_images') as ReturnType<typeof supabase.from>
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const { sectionId, imageId } = await context.params

  const ctx = await getUserContext()
  if (!ctx?.tenant_id || !['owner', 'admin', 'staff'].includes(ctx.role ?? '')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getSupabaseServerClient()
  const tenantId = ctx.tenant_id

  // ── Fetch the target generated image ─────────────────────────────────────
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

  if (image.is_archived) {
    return NextResponse.json(
      { error: 'Cannot activate an archived image. Restore it first.' },
      { status: 422 },
    )
  }

  const imageUrl = image.image_url || image.public_url || ''

  // ── Deactivate all other images for same slot ─────────────────────────────
  await wsiFrom(supabase)
    .update({ is_active: false, status: 'generated', updated_at: new Date().toISOString() } as never)
    .eq('tenant_id', tenantId)
    .eq('section_id', sectionId)
    .eq('slot_key', image.slot_key)
    .neq('id', imageId)

  // ── Activate this image ───────────────────────────────────────────────────
  const { data: activatedData, error: activateErr } = await wsiFrom(supabase)
    .update({ is_active: true, status: 'active', updated_at: new Date().toISOString() } as never)
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

  // Update draft snapshot in background so the activated image is captured
  // in the next checkpoint — non-blocking
  if (ctx.tenant_id) {
    const tid = ctx.tenant_id
    const uid = ctx.id ?? ''
    Promise.resolve().then(async () => {
      try {
        const snap = await getCurrentWebsiteSnapshot(tid)
        if (snap.data) {
          const n = normalizeSnapshotForInsert(snap.data)
          await updateDraftSnapshot(tid, n as unknown as Parameters<typeof updateDraftSnapshot>[1], uid)
        }
      } catch { /* non-fatal */ }
    })
  }

  return NextResponse.json({
    success:       true,
    activated,
    updatedSection,
    sectionId,
    imageId,
    imageSlot:     image.slot_key,
    publicUrl:     imageUrl,
  })
}

