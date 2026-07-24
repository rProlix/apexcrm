import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { listSlackChannels } from '@/lib/server/slack/api'
import { decryptIntegrationToken, loadActiveSlackIntegration } from '@/lib/server/slack/integration'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { validateSlackChannelSelection } from '@/lib/slack/channel-selection'
import type { Json } from '@/lib/supabase/types'

const updateSchema = z.object({
  businessId: z.string().uuid().optional(),
  channelIds: z.array(z.string().min(1)).max(200),
  maintenanceChannelId: z.string().min(1).nullable().optional(),
  maintenanceEnabled: z.boolean().optional().default(false),
})

const testSchema = z.object({
  businessId: z.string().uuid().optional(),
  action: z.literal('test_configuration'),
})

const REQUIRED_CHANNEL_SCOPES = ['channels:read', 'groups:read']

function missingScopes(scopes: string[]) {
  return REQUIRED_CHANNEL_SCOPES.filter((scope) => !scopes.includes(scope))
}

async function auditChannelConfiguration(input: {
  tenantId: string
  userId: string
  integrationId: string
  action: string
  metadata: Record<string, unknown>
}) {
  await getVanDamageServiceClient()
    .from('activity_logs')
    .insert({
      tenant_id: input.tenantId,
      actor_type: 'user',
      actor_id: input.userId,
      action: input.action,
      entity_type: 'van_slack_integration',
      entity_id: input.integrationId,
      metadata: input.metadata as Json,
    })
}

export async function GET(request: NextRequest) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), {
    manage: true,
  })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  if (!integration) return NextResponse.json({ error: 'Slack is not connected' }, { status: 404 })
  try {
    const db = getVanDamageServiceClient()
    const scopeWarnings = missingScopes(integration.scopes)
    const [channels, selectedResult, inspectionEventResult, maintenanceEventResult] =
      await Promise.all([
        scopeWarnings.length
          ? Promise.resolve([])
          : listSlackChannels(decryptIntegrationToken(integration)),
        db
          .from('van_slack_channels')
          .select('slack_channel_id,slack_channel_name,channel_type,purpose,is_enabled')
          .eq('integration_id', integration.id)
          .order('created_at', { ascending: true }),
        db
          .from('van_damage_slack_events')
          .select('created_at,slack_channel_id,status')
          .eq('integration_id', integration.id)
          .eq('status', 'enqueued')
          .order('created_at', { ascending: false })
          .limit(1),
        db
          .from('fleet_maintenance_slack_events')
          .select('created_at,slack_channel_id,status')
          .eq('integration_id', integration.id)
          .eq('status', 'processed')
          .order('created_at', { ascending: false })
          .limit(1),
      ])
    if (selectedResult.error) throw new Error(selectedResult.error.message)
    const mappings = selectedResult.data ?? []
    const selectedIds = new Set(
      mappings
        .filter((row) => row.purpose === 'damage_inspection' && row.is_enabled)
        .map((row) => row.slack_channel_id)
    )
    const maintenanceMapping =
      mappings.find((row) => row.purpose === 'maintenance' && row.is_enabled) ??
      mappings.find((row) => row.purpose === 'maintenance') ??
      null
    const maintenanceId = maintenanceMapping?.slack_channel_id ?? null
    const availableIds = new Set(channels.map((channel) => channel.id))
    const unavailableMappings = mappings.filter(
      (mapping) => !availableIds.has(mapping.slack_channel_id)
    )
    const mergedChannels = [
      ...channels.map((channel) => ({
        id: channel.id,
        name: channel.name,
        isPrivate: Boolean(channel.is_private),
        isMember: Boolean(channel.is_member),
        isArchived: Boolean(channel.is_archived),
        isAccessible: true,
        selected: selectedIds.has(channel.id),
        maintenanceSelected: maintenanceId === channel.id,
      })),
      ...unavailableMappings.map((mapping) => ({
        id: mapping.slack_channel_id,
        name: mapping.slack_channel_name || 'Unavailable channel',
        isPrivate: mapping.channel_type === 'private',
        isMember: false,
        isArchived: false,
        isAccessible: false,
        selected: mapping.purpose === 'damage_inspection' && mapping.is_enabled,
        maintenanceSelected: mapping.purpose === 'maintenance',
      })),
    ]
    const channelIssues = mappings
      .filter((mapping) => mapping.is_enabled)
      .flatMap((mapping) => {
        const channel = mergedChannels.find((entry) => entry.id === mapping.slack_channel_id)
        const label = mapping.purpose === 'maintenance' ? 'maintenance' : 'inspection'
        if (!channel?.isAccessible)
          return [`The saved ${label} channel is no longer accessible to the Slack app.`]
        if (channel.isArchived) return [`The saved ${label} channel #${channel.name} is archived.`]
        if (!channel.isMember)
          return [`Invite the Slack app to the saved ${label} channel #${channel.name}.`]
        return []
      })
    const issues = [
      ...(scopeWarnings.length ? [`Reconnect Slack to grant: ${scopeWarnings.join(', ')}`] : []),
      ...channelIssues,
    ]
    return NextResponse.json({
      channels: mergedChannels,
      maintenanceEnabled: Boolean(maintenanceMapping?.is_enabled),
      health: {
        healthy: issues.length === 0,
        issues,
        missingScopes: scopeWarnings,
        lastInspectionUploadAt: inspectionEventResult.data?.[0]?.created_at ?? null,
        lastInspectionStatus: inspectionEventResult.data?.[0]?.status ?? null,
        lastMaintenanceMessageAt: maintenanceEventResult.data?.[0]?.created_at ?? null,
        lastMaintenanceStatus: maintenanceEventResult.data?.[0]?.status ?? null,
      },
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
  const selectionError = validateSlackChannelSelection({
    inspectionChannelIds: parsed.data.channelIds,
    maintenanceChannelId: parsed.data.maintenanceChannelId ?? null,
    maintenanceEnabled: parsed.data.maintenanceEnabled,
  })
  if (selectionError) {
    if (
      parsed.data.maintenanceChannelId &&
      parsed.data.channelIds.includes(parsed.data.maintenanceChannelId)
    ) {
      await auditChannelConfiguration({
        tenantId: access.tenantId,
        userId: access.userId,
        integrationId: integration.id,
        action: 'slack_channel_purpose_conflict_rejected',
        metadata: { channelId: parsed.data.maintenanceChannelId },
      })
    }
    return NextResponse.json({ error: selectionError }, { status: 400 })
  }
  const scopes = missingScopes(integration.scopes)
  if (scopes.length) {
    return NextResponse.json(
      { error: `Reconnect Slack to grant: ${scopes.join(', ')}` },
      { status: 409 }
    )
  }

  const available = await listSlackChannels(decryptIntegrationToken(integration))
  const availableMap = new Map(available.map((channel) => [channel.id, channel]))
  const invalidInspection = parsed.data.channelIds.find((id) => {
    const channel = availableMap.get(id)
    return !channel || channel.is_archived
  })
  if (invalidInspection) {
    return NextResponse.json(
      { error: 'One or more inspection channels are archived or not visible to the Slack app' },
      { status: 400 }
    )
  }
  if (parsed.data.channelIds.some((id) => !availableMap.get(id)?.is_member)) {
    return NextResponse.json(
      { error: 'Invite the Slack bot to every selected channel before saving' },
      { status: 400 }
    )
  }
  if (
    parsed.data.maintenanceChannelId &&
    (!availableMap.has(parsed.data.maintenanceChannelId) ||
      availableMap.get(parsed.data.maintenanceChannelId)?.is_archived)
  ) {
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
  const db = getVanDamageServiceClient()
  const { data: previousMaintenance } = await db
    .from('van_slack_channels')
    .select('slack_channel_id,is_enabled')
    .eq('integration_id', integration.id)
    .eq('purpose', 'maintenance')
    .eq('is_enabled', true)
    .maybeSingle()
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
          is_enabled: purpose === 'maintenance' ? parsed.data.maintenanceEnabled : true,
        }
      }),
      { onConflict: 'integration_id,slack_channel_id' }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  const auditAction =
    previousMaintenance && !parsed.data.maintenanceEnabled
      ? 'slack_maintenance_ingestion_disabled'
      : !previousMaintenance && parsed.data.maintenanceEnabled
        ? 'slack_maintenance_ingestion_enabled'
        : previousMaintenance &&
            parsed.data.maintenanceChannelId !== previousMaintenance.slack_channel_id
          ? 'slack_maintenance_channel_changed'
          : 'slack_channel_purposes_updated'
  await auditChannelConfiguration({
    tenantId: access.tenantId,
    userId: access.userId,
    integrationId: integration.id,
    action: auditAction,
    metadata: {
      inspectionChannelCount: parsed.data.channelIds.length,
      maintenanceChannelConfigured: Boolean(parsed.data.maintenanceChannelId),
      maintenanceEnabled: parsed.data.maintenanceEnabled,
      maintenanceChannelId: parsed.data.maintenanceChannelId,
      previousMaintenanceChannelId: previousMaintenance?.slack_channel_id ?? null,
    },
  })
  return NextResponse.json({
    ok: true,
    selectedCount: parsed.data.channelIds.length,
    maintenanceChannelConfigured: Boolean(parsed.data.maintenanceChannelId),
    maintenanceEnabled: parsed.data.maintenanceEnabled,
  })
}

export async function POST(request: NextRequest) {
  const parsed = testSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid test request' }, { status: 400 })
  const access = await resolveVanDamageAccess(parsed.data.businessId, { manage: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const integration = await loadActiveSlackIntegration(access.tenantId, access.businessId)
  if (!integration) return NextResponse.json({ error: 'Slack is not connected' }, { status: 404 })

  try {
    const db = getVanDamageServiceClient()
    const scopes = missingScopes(integration.scopes)
    if (scopes.length) {
      const issues = [`Reconnect Slack to grant: ${scopes.join(', ')}`]
      return NextResponse.json({ ok: false, healthy: false, issues })
    }
    const [available, mappingResult] = await Promise.all([
      listSlackChannels(decryptIntegrationToken(integration)),
      db
        .from('van_slack_channels')
        .select('slack_channel_id,purpose,is_enabled')
        .eq('integration_id', integration.id),
    ])
    if (mappingResult.error) throw new Error(mappingResult.error.message)
    const availableMap = new Map(available.map((channel) => [channel.id, channel]))
    const enabledMappings = (mappingResult.data ?? []).filter((mapping) => mapping.is_enabled)
    const issues = enabledMappings.flatMap((mapping) => {
      const channel = availableMap.get(mapping.slack_channel_id)
      if (!channel)
        return [
          `The selected ${mapping.purpose === 'maintenance' ? 'maintenance' : 'inspection'} channel is inaccessible.`,
        ]
      if (channel.is_archived) return [`#${channel.name} is archived.`]
      if (!channel.is_member) return [`Invite the Slack app to #${channel.name}.`]
      return []
    })
    await auditChannelConfiguration({
      tenantId: access.tenantId,
      userId: access.userId,
      integrationId: integration.id,
      action: 'slack_channel_configuration_tested',
      metadata: { healthy: issues.length === 0, issueCount: issues.length },
    })
    return NextResponse.json({ ok: issues.length === 0, healthy: issues.length === 0, issues })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        healthy: false,
        issues: [error instanceof Error ? error.message : 'Unable to test channel configuration'],
      },
      { status: 502 }
    )
  }
}
