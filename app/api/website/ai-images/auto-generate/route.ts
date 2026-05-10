// app/api/website/ai-images/auto-generate/route.ts
// POST /api/website/ai-images/auto-generate
// End-to-end: plan → generate all images → return results.
// Runs synchronously (suitable for small sites). For large sites, consider
// triggering background jobs per plan individually.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import { generateWebsiteImage } from '@/lib/ai/websiteImageGenerator'
import { getSafeCreatedBy } from '@/lib/auth/getSafeCreatedBy'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const access = await requireAiAutofillAccess(
    ctx.role === 'owner' ? (body.tenantId as string | null) : null,
  )
  if (!access)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const tenantId    = access.tenantId
  const planGroupId = typeof body.planGroupId === 'string' ? body.planGroupId : null
  const planIds     = Array.isArray(body.planIds) ? body.planIds as string[] : []

  const supabase = getSupabaseServerClient()

  // Fetch plans to generate
  let query = supabase
    .from('website_image_plans')
    .select('*')
    .eq('tenant_id', tenantId)
    .in('status', ['planned', 'approved'])
    .order('priority', { ascending: true })
    .limit(10) // safety cap

  if (planGroupId) query = query.eq('plan_group_id', planGroupId)
  if (planIds.length) query = query.in('id', planIds)

  const { data: plans, error: fetchErr } = await query
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!plans?.length)
    return NextResponse.json({ results: [], message: 'No eligible plans found.' })

  const results: Array<{
    planId:     string
    jobId:      string
    publicUrl:  string
    altText:    string
    error?:     string
  }> = []

  for (const plan of plans) {
    const typedPlan = plan as WebsiteImagePlan
    const result = await generateWebsiteImage({
      plan:         typedPlan,
      tenantId,
      businessType: null,
      createdBy:    getSafeCreatedBy(ctx.auth_id),
    })
    results.push({
      planId:    typedPlan.id,
      jobId:     result.jobId,
      publicUrl: result.publicUrl,
      altText:   result.altText,
      error:     result.error,
    })
  }

  const succeeded = results.filter(r => !r.error).length
  const failed    = results.filter(r =>  r.error).length

  return NextResponse.json({ results, succeeded, failed, total: results.length })
}
