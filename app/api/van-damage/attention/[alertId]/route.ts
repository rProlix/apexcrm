import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export const runtime = 'nodejs'

const requestSchema = z.object({
  action: z.enum(['acknowledge', 'repair_scheduled', 'in_repair', 'repaired']),
  reason: z.string().trim().max(500).optional(),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ alertId: string }> }
) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid Fleet attention action' }, { status: 400 })
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), {
    manage: true,
  })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { alertId } = await params
  const db = getVanDamageServiceClient()
  const { error } = await db.rpc('update_van_severe_attention', {
    p_alert_id: alertId,
    p_tenant_id: access.tenantId,
    p_business_id: access.businessId,
    p_action: parsed.data.action,
    p_actor_id: access.userId,
    p_reason: parsed.data.reason ?? null,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, action: parsed.data.action })
}
