// app/api/website/ai-images/plans/[id]/generate/route.ts
// POST /api/website/ai-images/plans/[id]/generate
// Generate the image for one plan using Imagen.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { generateWebsiteImage } from '@/lib/ai/websiteImageGenerator'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import {
  isSchemaCacheError,
  buildTableMissingMessage,
  extractMissingTableName,
  MISSING_API_KEY_MESSAGE,
} from '@/lib/website-ai/imagePipelineErrors'
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

  const supabase = getSupabaseServerClient()
  const { data: plan, error: planErr } = await supabase
    .from('website_image_plans')
    .select('*')
    .eq('id', planId)
    .single()

  if (planErr) {
    if (isSchemaCacheError(planErr)) {
      const tbl = extractMissingTableName(planErr)
      console.error('[AI-IMAGE][generate] Schema/table error loading plan:', planErr.message)
      return NextResponse.json({
        error:        buildTableMissingMessage(tbl ?? 'website_image_plans'),
        code:         'MISSING_TABLE',
        missingTable: tbl ?? 'website_image_plans',
        detail:       planErr.message,
        diagnostics:  '/api/owner/diagnostics/website-images',
      }, { status: 503 })
    }
    console.error('[AI-IMAGE][generate] Plan load error:', planErr.message)
    return NextResponse.json({ error: planErr.message }, { status: 500 })
  }
  if (!plan) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })

  // Validate API key before attempting generation
  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: MISSING_API_KEY_MESSAGE, code: 'MISSING_API_KEY' }, { status: 503 })
  }

  const typedPlan = plan as WebsiteImagePlan

  const access = await requireAiAutofillAccess(
    ctx.role === 'owner' ? typedPlan.tenant_id : null,
  )
  if (!access || access.tenantId !== typedPlan.tenant_id)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  if (typedPlan.status === 'generating')
    return NextResponse.json({ error: 'Generation already in progress.' }, { status: 409 })

  // Mark as generating
  await supabase
    .from('website_image_plans')
    .update({ status: 'generating', updated_at: new Date().toISOString() } as never)
    .eq('id', planId)

  // Load tenant name
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', typedPlan.tenant_id)
    .single()

  const result = await generateWebsiteImage({
    plan:         typedPlan,
    tenantId:     typedPlan.tenant_id,
    businessType: null,
    createdBy:    getSafeCreatedBy(ctx.auth_id),
  })

  if (result.error) {
    return NextResponse.json({ error: result.error, jobId: result.jobId }, { status: 500 })
  }

  // Re-fetch updated plan
  const { data: updatedPlan } = await supabase
    .from('website_image_plans')
    .select('*')
    .eq('id', planId)
    .single()

  return NextResponse.json({
    plan:       updatedPlan,
    jobId:      result.jobId,
    publicUrl:  result.publicUrl,
    storagePath: result.storagePath,
    altText:    result.altText,
    tenantName: tenant?.name,
  })
}
