import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { listSlackChannels } from '@/lib/server/slack/api'
import { decryptIntegrationToken, loadActiveSlackIntegration } from '@/lib/server/slack/integration'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

const updateSchema = z.object({
  businessId: z.string().uuid().optional(),
  channelIds: z.array(z.string().min(1)).max(200),
  maintenanceChannelId: z.string().min(1).nullable().optional(),
})

export async function GET(request: NextRequest) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), {
    manage: true,
  })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  if (!integration) return NextResponse.json({ error: 'Slack is not connected' }, { status: 404 })
  try {
    const [channels, selectedResult] = await Promise.all([
      listSlackChannels(decryptIntegrationToken(integration)),
      getVanDamageServiceClient()
        .from('van_slack_channels')
        .select('slack_channel_id,purpose')
        .eq('integration_id', integration.id)
        .eq('is_enabled', true),
    ])
    const selectedIds = new Set(
      (selectedResult.data ?? [])
        .filter((row) => (row as { purpose?: string }).purpose !== 'maintenance')
        .map((row) => row.slack_channel_id)
    )
    const maintenanceId =
      (selectedResult.data ?? []).find(
        (row) => (row as { purpose?: string }).purpose === 'maintenance'
      )?.slack_channel_id ?? null
    return NextResponse.json({
      channels: channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        isPrivate: Boolean(channel.is_private),
        isMember: Boolean(channel.is_member),
        selected: selectedIds.has(channel.id),
        maintenanceSelected: maintenanceId === channel.id,
      })),
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to list Slack channels' },
      { status: 502 }
    )
  }
}

export async function PUT(request: NextRequest) {
  const parsed = updateSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid channel selection' }, { status: 400 })
  const access = await resolveVanDamageAccess(parsed.data.businessId, { manage: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  if (!integration) return NextResponse.json({ error: 'Slack is not connected' }, { status: 404 })

  const available = await listSlackChannels(decryptIntegrationToken(integration))
  const availableMap = new Map(available.map((channel) => [channel.id, channel]))
  if (parsed.data.channelIds.some((id) => !availableMap.has(id))) {
    return NextResponse.json(
      { error: 'One or more channels are not visible to the Slack app' },
      { status: 400 }
    )
  }
  if (parsed.data.channelIds.some((id) => !availableMap.get(id)?.is_member)) {
    return NextResponse.json(
      { error: 'Invite the Slack bot to every selected channel before saving' },
      { status: 400 }
    )
  }
  if (parsed.data.maintenanceChannelId && !availableMap.has(parsed.data.maintenanceChannelId)) {
    return NextResponse.json(
      { error: 'The maintenance channel is not visible to the Slack app' },
      { status: 400 }
    )
  }
  if (
    parsed.data.maintenanceChannelId &&
    !availableMap.get(parsed.data.maintenanceChannelId)?.is_member
  ) {
    return NextResponse.json(
      { error: 'Invite the Slack bot to the maintenance channel before saving' },
      { status: 400 }
    )
  }
  if (
    parsed.data.maintenanceChannelId &&
    parsed.data.channelIds.includes(parsed.data.maintenanceChannelId)
  ) {
    return NextResponse.json(
      { error: 'A Slack channel cannot be used for both inspections and maintenance' },
      { status: 400 }
    )
  }

  const db = getVanDamageServiceClient()
  const { error: disableError } = await db
    .from('van_slack_channels')
    .update({ is_enabled: false })
    .eq('integration_id', integration.id)
  if (disableError) return NextResponse.json({ error: disableError.message }, { status: 500 })
  const configured: Array<{ id: string; purpose: 'damage_inspection' | 'maintenance' }> = [
    ...parsed.data.channelIds.map((id) => ({ id, purpose: 'damage_inspection' as const })),
    ...(parsed.data.maintenanceChannelId
      ? [{ id: parsed.data.maintenanceChannelId, purpose: 'maintenance' as const }]
      : []),
  ]
  if (configured.length) {
    const { error } = await db.from('van_slack_channels').upsert(
      configured.map(({ id, purpose }) => {
        const channel = availableMap.get(id)!
        return {
          tenant_id: access.tenantId,
          business_id: access.businessId,
          integration_id: integration.id,
          slack_channel_id: id,
          slack_channel_name: channel.name,
          channel_type: channel.is_private ? 'private' : 'public',
          purpose,
          is_enabled: true,
        }
      }),
      { onConflict: 'integration_id,slack_channel_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  await db.from('activity_logs').insert({
    tenant_id: access.tenantId,
    actor_type: 'user',
    actor_id: access.userId,
    action: 'slack_channel_purposes_updated',
    entity_type: 'van_slack_integration',
    entity_id: integration.id,
    metadata: {
      inspectionChannelCount: parsed.data.channelIds.length,
      maintenanceChannelConfigured: Boolean(parsed.data.maintenanceChannelId),
    },
  })
  return NextResponse.json({
    ok: true,
    selectedCount: parsed.data.channelIds.length,
    maintenanceChannelConfigured: Boolean(parsed.data.maintenanceChannelId),
  })
}
