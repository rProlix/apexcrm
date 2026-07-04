import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { listSlackChannels } from '@/lib/server/slack/api'
import { decryptIntegrationToken, loadActiveSlackIntegration } from '@/lib/server/slack/integration'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

const updateSchema = z.object({
  businessId: z.string().uuid().optional(),
  channelIds: z.array(z.string().min(1)).max(200),
})

export async function GET(request: NextRequest) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), { manage: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  if (!integration) return NextResponse.json({ error: 'Slack is not connected' }, { status: 404 })
  try {
    const [channels, selectedResult] = await Promise.all([
      listSlackChannels(decryptIntegrationToken(integration)),
      getVanDamageServiceClient().from('van_slack_channels').select('slack_channel_id')
        .eq('integration_id', integration.id).eq('is_enabled', true),
    ])
    const selectedIds = new Set((selectedResult.data ?? []).map((row) => row.slack_channel_id))
    return NextResponse.json({
      channels: channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        isPrivate: Boolean(channel.is_private),
        isMember: Boolean(channel.is_member),
        selected: selectedIds.has(channel.id),
      })),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to list Slack channels' }, { status: 502 })
  }
}

export async function PUT(request: NextRequest) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid channel selection' }, { status: 400 })
  const access = await resolveVanDamageAccess(parsed.data.businessId, { manage: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  if (!integration) return NextResponse.json({ error: 'Slack is not connected' }, { status: 404 })

  const available = await listSlackChannels(decryptIntegrationToken(integration))
  const availableMap = new Map(available.map((channel) => [channel.id, channel]))
  if (parsed.data.channelIds.some((id) => !availableMap.has(id))) {
    return NextResponse.json({ error: 'One or more channels are not visible to the Slack app' }, { status: 400 })
  }
  if (parsed.data.channelIds.some((id) => !availableMap.get(id)?.is_member)) {
    return NextResponse.json({ error: 'Invite the Slack bot to every selected channel before saving' }, { status: 400 })
  }

  const db = getVanDamageServiceClient()
  const { error: disableError } = await db.from('van_slack_channels')
    .update({ is_enabled: false }).eq('integration_id', integration.id)
  if (disableError) return NextResponse.json({ error: disableError.message }, { status: 500 })
  if (parsed.data.channelIds.length) {
    const { error } = await db.from('van_slack_channels').upsert(parsed.data.channelIds.map((id) => {
      const channel = availableMap.get(id)!
      return {
        tenant_id: access.tenantId,
        business_id: access.businessId,
        integration_id: integration.id,
        slack_channel_id: id,
        slack_channel_name: channel.name,
        channel_type: channel.is_private ? 'private' : 'public',
        is_enabled: true,
      }
    }), { onConflict: 'integration_id,slack_channel_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, selectedCount: parsed.data.channelIds.length })
}
