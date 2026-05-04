// app/api/website/ai-images/plans/[id]/apply/route.ts
// POST /api/website/ai-images/plans/[id]/apply
// Attaches the generated image to the correct site_section content field.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { buildImageContentPatch, mergeImageIntoContent } from '@/lib/website-builder/imagePlacement'
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

  if (!typedPlan.generated_asset_url)
    return NextResponse.json({ error: 'No generated image to apply. Generate first.' }, { status: 422 })

  if (!typedPlan.section_id)
    return NextResponse.json({ error: 'No target section linked to this plan.' }, { status: 422 })

  // Load the current section content
  const { data: section, error: sectionErr } = await supabase
    .from('site_sections')
    .select('id, section_type, content')
    .eq('id', typedPlan.section_id)
    .eq('tenant_id', typedPlan.tenant_id)
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
    .eq('tenant_id', typedPlan.tenant_id)

  if (updateErr)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // Mark plan as applied
  await supabase
    .from('website_image_plans')
    .update({ status: 'applied', updated_at: new Date().toISOString() } as never)
    .eq('id', planId)

  return NextResponse.json({
    success:             true,
    sectionId:           typedPlan.section_id,
    imageUrl:            typedPlan.generated_asset_url,
    placementDescription,
  })
}
