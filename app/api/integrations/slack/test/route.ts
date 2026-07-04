import { NextRequest, NextResponse } from 'next/server'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { callSlackApi } from '@/lib/server/slack/api'
import { decryptIntegrationToken, loadActiveSlackIntegration } from '@/lib/server/slack/integration'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

type AuthTestResponse = { ok: boolean; error?: string; team?: string; team_id?: string; user_id?: string }

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({})) as { businessId?: string }
  const access = await resolveVanDamageAccess(body.businessId, { manage: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  if (!integration) return NextResponse.json({ error: 'Slack is not connected' }, { status: 404 })

  const db = getVanDamageServiceClient()
  try {
    const result = await callSlackApi<AuthTestResponse>('auth.test', decryptIntegrationToken(integration))
    await db.from('van_slack_integrations').update({
      last_tested_at: new Date().toISOString(), last_error: null,
    }).eq('id', integration.id)
    return NextResponse.json({ ok: true, workspace: result.team, teamId: result.team_id, botUserId: result.user_id })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Slack connection test failed'
    await db.from('van_slack_integrations').update({
      last_tested_at: new Date().toISOString(), last_error: message,
    }).eq('id', integration.id)
    return NextResponse.json({ ok: false, error: message }, { status: 502 })
  }
}
