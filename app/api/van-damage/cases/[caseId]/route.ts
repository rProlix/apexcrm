import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export const runtime = 'nodejs'

const requestSchema = z.object({
  effectiveSeverity: z.enum(['level_1', 'level_2', 'level_3', 'critical']),
  reason: z.string().trim().min(1).max(500),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json(
      { error: 'A valid severity and review reason are required' },
      { status: 400 }
    )
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), {
    manage: true,
  })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { caseId } = await params
  const db = getVanDamageServiceClient()
  const { error } = await db.rpc('review_van_damage_case_severity', {
    p_case_id: caseId,
    p_tenant_id: access.tenantId,
    p_business_id: access.businessId,
    p_effective_severity: parsed.data.effectiveSeverity,
    p_actor_id: access.userId,
    p_reason: parsed.data.reason,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, effectiveSeverity: parsed.data.effectiveSeverity })
}
