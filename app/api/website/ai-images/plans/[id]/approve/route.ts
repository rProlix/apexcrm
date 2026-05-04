// app/api/website/ai-images/plans/[id]/approve/route.ts
// POST — mark a plan as approved

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
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
  const { data: plan, error } = await supabase
    .from('website_image_plans').select('*').eq('id', planId).single()
  if (error || !plan) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })

  const typedPlan = plan as WebsiteImagePlan
  const access = await requireAiAutofillAccess(ctx.role === 'owner' ? typedPlan.tenant_id : null)
  if (!access || access.tenantId !== typedPlan.tenant_id)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  await supabase
    .from('website_image_plans')
    .update({ status: 'approved', updated_at: new Date().toISOString() } as never)
    .eq('id', planId)

  return NextResponse.json({ success: true, status: 'approved' })
}
