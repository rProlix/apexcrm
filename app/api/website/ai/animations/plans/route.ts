// app/api/website/ai/animations/plans/route.ts
// GET /api/website/ai/animations/plans?tenantId=...&pageId=...&sectionId=...

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tenantId  = searchParams.get('tenantId')
  const pageId    = searchParams.get('pageId')
  const sectionId = searchParams.get('sectionId')
  const status    = searchParams.get('status')

  if (!tenantId) return NextResponse.json({ error: 'tenantId is required.' }, { status: 400 })

  const supabase = getSupabaseServerClient()

  // Verify tenant access
  const { data: userRow } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('auth_user_id', ctx.auth_id)
    .single()
  if (!userRow || userRow.tenant_id !== tenantId)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  let query = supabase
    .from('website_animation_plans')
    .select('id, tenant_id, site_page_id, site_section_id, status, scope, desired_vibe, intensity, performance_mode, ai_plan, animation_config, error_message, created_at, updated_at, applied_at')
    .eq('tenant_id', tenantId)
    .neq('status', 'archived')
    .order('created_at', { ascending: false })
    .limit(20)

  if (pageId)    query = query.eq('site_page_id', pageId)
  if (sectionId) query = query.eq('site_section_id', sectionId)
  if (status)    query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ plans: data ?? [] })
}
