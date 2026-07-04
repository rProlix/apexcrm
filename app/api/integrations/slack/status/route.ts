import { NextRequest, NextResponse } from 'next/server'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { loadActiveSlackIntegration, publicIntegration } from '@/lib/server/slack/integration'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export async function GET(request: NextRequest) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), { manage: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  let selectedChannelCount = 0
  if (integration) {
    const db = getVanDamageServiceClient()
    const { count } = await db.from('van_slack_channels').select('id', { count: 'exact', head: true })
      .eq('integration_id', integration.id).eq('is_enabled', true)
    selectedChannelCount = count ?? 0
  }
  return NextResponse.json({ integration: publicIntegration(integration), selectedChannelCount })
}
