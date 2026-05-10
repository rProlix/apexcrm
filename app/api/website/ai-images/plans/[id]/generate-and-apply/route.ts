// app/api/website/ai-images/plans/[id]/generate-and-apply/route.ts
// POST /api/website/ai-images/plans/[id]/generate-and-apply
// One-click: generate the image with Imagen, upload to Supabase Storage,
// then apply it to the target website section. Returns full context.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { generateWebsiteImage } from '@/lib/ai/websiteImageGenerator'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { buildImageContentPatch, mergeImageIntoContent } from '@/lib/website-builder/imagePlacement'
import { getSafeCreatedBy } from '@/lib/auth/getSafeCreatedBy'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'

export const dynamic = 'force-dynamic'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  // ── Load plan ─────────────────────────────────────────────────────────────
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

  if (typedPlan.status === 'generating')
    return NextResponse.json({ error: 'Generation already in progress.' }, { status: 409 })

  // ── Mark as generating ────────────────────────────────────────────────────
  await supabase
    .from('website_image_plans')
    .update({ status: 'generating', updated_at: new Date().toISOString() } as never)
    .eq('id', planId)

  // ── Generate image ────────────────────────────────────────────────────────
  const result = await generateWebsiteImage({
    plan:         typedPlan,
    tenantId:     typedPlan.tenant_id,
    businessType: null,
    createdBy:    getSafeCreatedBy(ctx.auth_id),
  })

  if (result.error) {
    return NextResponse.json({
      error:         result.error,
      jobId:         result.jobId,
      step:          'generate',
      applied:       false,
    }, { status: 500 })
  }

  // ── Apply to section ──────────────────────────────────────────────────────
  if (!typedPlan.section_id) {
    // Generation succeeded but no section to apply to.
    const { data: updatedPlan } = await supabase
      .from('website_image_plans')
      .select('*')
      .eq('id', planId)
      .single()

    return NextResponse.json({
      generated:   true,
      applied:     false,
      applySkipped: true,
      reason:      'No section linked to this plan. Image generated and saved.',
      jobId:       result.jobId,
      publicUrl:   result.publicUrl,
      storagePath: result.storagePath,
      altText:     result.altText,
      plan:        updatedPlan,
    })
  }

  const { data: section, error: sectionErr } = await supabase
    .from('site_sections')
    .select('id, section_type, content')
    .eq('id', typedPlan.section_id)
    .eq('tenant_id', typedPlan.tenant_id)
    .single()

  if (sectionErr || !section) {
    return NextResponse.json({
      generated:   true,
      applied:     false,
      error:       `Section ${typedPlan.section_id} not found — image was generated but not applied.`,
      jobId:       result.jobId,
      publicUrl:   result.publicUrl,
      storagePath: result.storagePath,
    }, { status: 207 })
  }

  const { contentPatch, placementDescription } = buildImageContentPatch(
    section.section_type,
    typedPlan.image_role,
    result.publicUrl,
    result.altText,
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
    .eq('tenant_id', typedPlan.tenant_id)

  if (updateErr) {
    return NextResponse.json({
      generated:   true,
      applied:     false,
      error:       `Section update failed: ${updateErr.message}`,
      jobId:       result.jobId,
      publicUrl:   result.publicUrl,
      storagePath: result.storagePath,
    }, { status: 207 })
  }

  // Mark plan as applied — stamp applied_at (migration 054 column)
  await supabase
    .from('website_image_plans')
    .update({
      status:     'applied',
      applied_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('id', planId)

  const { data: finalPlan } = await supabase
    .from('website_image_plans')
    .select('*')
    .eq('id', planId)
    .single()

  console.log('[AI-IMAGE] generate-and-apply complete', {
    planId,
    jobId:       result.jobId,
    publicUrl:   result.publicUrl,
    storagePath: result.storagePath,
    sectionId:   typedPlan.section_id,
    sectionType: section.section_type,
    placementDescription,
  })

  return NextResponse.json({
    generated:           true,
    applied:             true,
    jobId:               result.jobId,
    publicUrl:           result.publicUrl,
    storagePath:         result.storagePath,
    altText:             result.altText,
    sectionId:           typedPlan.section_id,
    sectionType:         section.section_type,
    placementDescription,
    plan:                finalPlan,
    updatedSectionContent: mergedContent,
  })
}
