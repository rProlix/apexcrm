import { NextRequest, NextResponse } from 'next/server'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { loadActiveSlackIntegration } from '@/lib/server/slack/integration'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { businessId?: string; delete?: boolean }
  const access = await resolveVanDamageAccess(body.businessId, { manage: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  if (!integration) return NextResponse.json({ ok: true })
  const db = getVanDamageServiceClient()
  const { error } = await db.from('van_slack_integrations').update({
    status: 'disconnected',
    deleted_at: body.delete ? new Date().toISOString() : null,
  }).eq('id', integration.id).eq('tenant_id', access.tenantId).eq('business_id', access.businessId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: Boolean(body.delete) })
}
