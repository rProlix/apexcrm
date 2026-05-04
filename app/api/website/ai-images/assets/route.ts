// app/api/website/ai-images/assets/route.ts
// GET /api/website/ai-images/assets
// Lists AI-generated image assets (completed jobs) for a tenant.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess } from '@/lib/website-ai/tenantAccess'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tenantIdParam   = searchParams.get('tenantId')

  const access = await requireAiAutofillAccess(
    ctx.role === 'owner' ? tenantIdParam : null,
  )
  if (!access)
    return NextResponse.json({ error: 'Tenant access denied.' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('website_image_jobs')
    .select('id, plan_id, public_url, alt_text, image_role, placement_key, storage_path, created_at, model')
    .eq('tenant_id', access.tenantId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ assets: data ?? [] })
}
