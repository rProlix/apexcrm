// app/api/website/ai-images/plans/[id]/regenerate/route.ts
// POST — regenerate an image, optionally with an edited prompt

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { generateWebsiteImage } from '@/lib/ai/websiteImageGenerator'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { getSafeCreatedBy } from '@/lib/auth/getSafeCreatedBy'
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

  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* body is optional */ }

  const supabase = getSupabaseServerClient()
  const { data: plan, error } = await supabase
    .from('website_image_plans').select('*').eq('id', planId).single()
  if (error || !plan) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })

  const typedPlan = plan as WebsiteImagePlan
  const access = await requireAiAutofillAccess(ctx.role === 'owner' ? typedPlan.tenant_id : null)
  if (!access || access.tenantId !== typedPlan.tenant_id)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  // Allow prompt override
  const newPrompt = typeof body.prompt === 'string' && body.prompt.trim()
    ? body.prompt.trim()
    : typedPlan.prompt

  if (newPrompt !== typedPlan.prompt) {
    await supabase
      .from('website_image_plans')
      .update({ prompt: newPrompt, updated_at: new Date().toISOString() } as never)
      .eq('id', planId)
    typedPlan.prompt = newPrompt
  }

  // Reset to planned so generate can run
  await supabase
    .from('website_image_plans')
    .update({ status: 'planned', generated_asset_url: null, updated_at: new Date().toISOString() } as never)
    .eq('id', planId)

  const result = await generateWebsiteImage({
    plan:         typedPlan,
    tenantId:     typedPlan.tenant_id,
    businessType: null,
    createdBy:    getSafeCreatedBy(ctx.auth_id),
  })

  if (result.error)
    return NextResponse.json({ error: result.error, jobId: result.jobId }, { status: 500 })

  const { data: updatedPlan } = await supabase
    .from('website_image_plans').select('*').eq('id', planId).single()

  return NextResponse.json({
    plan:        updatedPlan,
    jobId:       result.jobId,
    publicUrl:   result.publicUrl,
    storagePath: result.storagePath,
    altText:     result.altText,
  })
}
