// app/api/website/ai-images/plans/[id]/apply/route.ts
// POST /api/website/ai-images/plans/[id]/apply
// Attaches the generated image to the correct site_section content field.
// After applying, updates the draft snapshot so checkpoints stay accurate.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { buildImageContentPatch, mergeImageIntoContent } from '@/lib/website-builder/imagePlacement'
import { getCurrentWebsiteSnapshot, updateDraftSnapshot } from '@/lib/website/versioning'
import { normalizeSnapshotForInsert } from '@/lib/website/snapshot/safeJson'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'

export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()
  const { data: plan, error: planErr } = await supabase
    .from('website_image_plans')
    .select('*')
    .eq('id', planId)
    .single()

  if (planErr || !plan)
    return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })

  const typedPlan = plan as WebsiteImagePlan

  const access = await requireAiAutofillAccess(
    ctx.role === 'owner' ? typedPlan.tenant_id : null,
  )
  if (!access || access.tenantId !== typedPlan.tenant_id)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const { tenantId } = access

  if (!typedPlan.generated_asset_url)
    return NextResponse.json({ error: 'No generated image to apply. Generate first.' }, { status: 422 })

  if (!typedPlan.section_id)
    return NextResponse.json({ error: 'No target section linked to this plan.' }, { status: 422 })

  // Load the current section content
  const { data: section, error: sectionErr } = await supabase
    .from('site_sections')
    .select('id, section_type, content')
    .eq('id', typedPlan.section_id)
    .eq('tenant_id', tenantId)
    .single()

  if (sectionErr || !section)
    return NextResponse.json({ error: 'Target section not found.' }, { status: 404 })

  const { contentPatch, placementDescription } = buildImageContentPatch(
    section.section_type,
    typedPlan.image_role,
    typedPlan.generated_asset_url,
    typedPlan.generated_alt_text ?? '',
    planId,
  )

  const mergedContent = mergeImageIntoContent(
    section.content as Record<string, unknown>,
    contentPatch,
  )

  const { error: updateErr } = await supabase
    .from('site_sections')
    .update({ content: mergedContent as never, updated_at: new Date().toISOString() } as never)
    .eq('id', typedPlan.section_id)
    .eq('tenant_id', tenantId)

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Update draft snapshot so the applied image is captured in the next checkpoint
  updateDraftAfterImageApply(tenantId, ctx.id ?? '', 'ai_images', `AI image applied to section ${typedPlan.section_id} (plan ${planId})`)

  // Mark plan as applied
  await supabase
    .from('website_image_plans')
    .update({
      status:     'applied',
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', planId)

  return NextResponse.json({
    success:             true,
    sectionId:           typedPlan.section_id,
    imageUrl:            typedPlan.generated_asset_url,
    placementDescription,
    draftSaved:          true,
  })
}

/**
 * Background: refresh draft snapshot after an image operation so the next
 * checkpoint captures the applied image. Non-blocking — never fails the request.
 */
function updateDraftAfterImageApply(
  tenantId: string,
  userId: string,
  source: string,
  label: string,
) {
  Promise.resolve().then(async () => {
    try {
      const snapResult = await getCurrentWebsiteSnapshot(tenantId)
      if (snapResult.data) {
        const normalized = normalizeSnapshotForInsert(snapResult.data) as unknown as Parameters<typeof updateDraftSnapshot>[1]
        await updateDraftSnapshot(tenantId, normalized, userId)
      }
      // Save a background version (non-blocking)
      const { createWebsiteVersion } = await import('@/lib/website/versioning')
      await createWebsiteVersion({
        tenantId,
        label,
        source: source as Parameters<typeof createWebsiteVersion>[0]['source'],
        status: 'draft',
        createdBy: userId,
      })
    } catch (e) {
      console.warn('[ai-images] Background draft update failed (non-fatal):', e instanceof Error ? e.message : e)
    }
  })
}
