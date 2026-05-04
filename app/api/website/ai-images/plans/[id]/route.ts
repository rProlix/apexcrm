// app/api/website/ai-images/plans/[id]/route.ts
// GET    — get a single plan
// PATCH  — edit prompt / title before regenerating

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'
import type { WebsiteImagePlan } from '@/lib/ai/websiteImageTypes'

export const dynamic = 'force-dynamic'

export async function GET(
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

  return NextResponse.json({ plan: typedPlan })
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: planId } = await params
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { data: plan, error } = await supabase
    .from('website_image_plans').select('*').eq('id', planId).single()
  if (error || !plan) return NextResponse.json({ error: 'Plan not found.' }, { status: 404 })

  const typedPlan = plan as WebsiteImagePlan
  const access = await requireAiAutofillAccess(ctx.role === 'owner' ? typedPlan.tenant_id : null)
  if (!access || access.tenantId !== typedPlan.tenant_id)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.prompt  === 'string') patch.prompt  = body.prompt.trim()
  if (typeof body.title   === 'string') patch.title   = body.title.trim()
  if (typeof body.negative_prompt === 'string') patch.negative_prompt = body.negative_prompt.trim()
  if (typeof body.aspect_ratio    === 'string') patch.aspect_ratio    = body.aspect_ratio

  await supabase.from('website_image_plans').update(patch as never).eq('id', planId)

  const { data: updated } = await supabase
    .from('website_image_plans').select('*').eq('id', planId).single()

  return NextResponse.json({ plan: updated })
}
