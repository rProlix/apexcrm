import { NextRequest, NextResponse } from 'next/server'
import { getSlackEventsEnv } from '@/lib/server/env'
import { verifySlackSignature } from '@/lib/server/slack/signature'
import {
  normalizeSlackImageEvent,
  normalizeSlackMessageEvent,
  sanitizeSlackEvent,
  type NormalizedSlackImageEvent,
  type SlackEventEnvelope,
} from '@/lib/server/slack/events'
import { decryptSecret, type EncryptedSecret } from '@/lib/server/crypto/encrypt-token'
import { resolveSlackUserSnapshot } from '@/lib/server/slack/user'
import { ingestMaintenanceSlackEvent } from '@/lib/server/maintenance/slack-ingest'
import { resolveSlackChannelPurpose } from '@/lib/server/slack/channel-routing'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { sendVanDamageJob } from '@/lib/server/aws/sqs'
import { slackTsToIso } from '@/lib/van-damage/history'
import type { VanDamageJobV1 } from '@/lib/van-damage/contracts'
import type { Json } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type SlackIngestRow = {
  event_row_id?: string
  inspection_row_id?: string
  job_row_id?: string
  upload_session_row_id?: string
  was_created?: boolean
  existing_sqs_message_id?: string | null
}

type SlackIngestResult = {
  rows: SlackIngestRow[] | null
  error: { message: string } | null
  usedPhase3dSchema: boolean
}

async function auditIgnored(payload: SlackEventEnvelope, reason: string) {
  if (!payload.team_id || !payload.event_id) return
  const db = getVanDamageServiceClient()
  const { data: integration } = await db
    .from('van_slack_integrations')
    .select('id, tenant_id, business_id')
    .eq('slack_team_id', payload.team_id)
    .eq('status', 'connected')
    .is('deleted_at', null)
    .maybeSingle()
  await db.from('van_damage_slack_events').upsert(
    {
      integration_id: integration?.id ?? null,
      tenant_id: integration?.tenant_id ?? null,
      business_id: integration?.business_id ?? null,
      slack_team_id: payload.team_id,
      slack_event_id: payload.event_id,
      slack_event_type: payload.event?.type ?? null,
      slack_channel_id: payload.event?.channel ?? payload.event?.channel_id ?? null,
      slack_user_id: payload.event?.user ?? payload.event?.user_id ?? null,
      raw_event: sanitizeSlackEvent(payload) as Json,
      status: `ignored_${reason}`.slice(0, 80),
    },
    { onConflict: 'slack_event_id', ignoreDuplicates: true }
  )
}

function slackFilesForRpc(event: NormalizedSlackImageEvent) {
  return event.files.map((file) => ({
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    size: file.size,
    width: file.width,
    height: file.height,
    url: file.url,
    fileAccess: file.fileAccess,
  })) as Json
}

async function ingestSlackEvent(input: {
  db: ReturnType<typeof getVanDamageServiceClient>
  integrationId: string
  event: NormalizedSlackImageEvent
  payload: SlackEventEnvelope
  title: string
  driver: Record<string, unknown>
  uploadSourceKey: string
}): Promise<SlackIngestResult> {
  const baseArgs = {
    p_integration_id: input.integrationId,
    p_slack_event_id: input.event.eventId,
    p_slack_event_type: input.event.eventType,
    p_slack_channel_id: input.event.channelId,
    p_slack_user_id: input.event.userId,
    p_raw_event: sanitizeSlackEvent(input.payload) as Json,
    p_slack_message_ts: input.event.messageTs,
    p_slack_thread_ts: input.event.threadTs,
    p_title: input.title,
    p_files: slackFilesForRpc(input.event),
  }
  const phase3d = await input.db.rpc('ingest_van_damage_slack_event', {
    ...baseArgs,
    p_driver_profile: input.driver as Json,
    p_upload_source_key: input.uploadSourceKey,
  })
  if (!phase3d.error)
    return { rows: phase3d.data as SlackIngestRow[] | null, error: null, usedPhase3dSchema: true }

  const message = phase3d.error.message ?? ''
  const migrationLikelyMissing =
    /p_driver_profile|p_upload_source_key|function .*ingest_van_damage_slack_event|schema cache|Could not find/i.test(
      message
    )
  if (!migrationLikelyMissing) {
    return { rows: null, error: { message }, usedPhase3dSchema: true }
  }

  const legacy = await input.db.rpc('ingest_van_damage_slack_event', baseArgs)
  return {
    rows: legacy.data as SlackIngestRow[] | null,
    error: legacy.error ? { message: legacy.error.message } : null,
    usedPhase3dSchema: false,
  }
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const { signingSecret } = getSlackEventsEnv()
  const valid = verifySlackSignature({
    body: rawBody,
    timestamp: request.headers.get('x-slack-request-timestamp'),
    signature: request.headers.get('x-slack-signature'),
    signingSecret,
  })
  if (!valid) return NextResponse.json({ error: 'Invalid Slack signature' }, { status: 401 })

  let payload: SlackEventEnvelope
  try {
    payload = JSON.parse(rawBody) as SlackEventEnvelope
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (payload.type === 'url_verification' && typeof payload.challenge === 'string') {
    return NextResponse.json({ challenge: payload.challenge })
  }

  const teamId = payload.team_id
  const channelId = payload.event?.channel ?? payload.event?.channel_id
  if (!teamId || !channelId) {
    await auditIgnored(payload, 'missing_routing_identifiers')
    return NextResponse.json({ ok: true, ignored: 'missing_routing_identifiers' })
  }
  const db = getVanDamageServiceClient()
  const { data: integration, error: integrationError } = await db
    .from('van_slack_integrations')
    .select('id, tenant_id, business_id, slack_team_id, encrypted_bot_token, scopes')
    .eq('slack_team_id', teamId)
    .eq('status', 'connected')
    .is('deleted_at', null)
    .maybeSingle()
  if (integrationError)
    return NextResponse.json({ error: 'Integration lookup failed' }, { status: 503 })
  if (!integration) {
    await auditIgnored(payload, 'workspace_not_connected')
    return NextResponse.json({ ok: true, ignored: 'workspace_not_connected' })
  }

  const { data: allowedChannel } = await db
    .from('van_slack_channels')
    .select('id,purpose')
    .eq('integration_id', integration.id)
    .eq('slack_channel_id', channelId)
    .eq('is_enabled', true)
    .maybeSingle()
  if (!allowedChannel) {
    await auditIgnored(payload, 'channel_not_selected')
    return NextResponse.json({ ok: true, ignored: 'channel_not_selected' })
  }
  const token = decryptSecret(integration.encrypted_bot_token as EncryptedSecret)

  const purpose = resolveSlackChannelPurpose(
    (allowedChannel as { purpose?: string }).purpose ?? 'damage_inspection'
  )
  if (!purpose) return NextResponse.json({ ok: true, ignored: 'unsupported_channel_purpose' })
  if (purpose === 'maintenance') {
    const normalizedMaintenance = normalizeSlackMessageEvent(payload)
    if (normalizedMaintenance.kind === 'ignored') {
      return NextResponse.json({ ok: true, ignored: normalizedMaintenance.reason })
    }
    const reporter = await resolveSlackUserSnapshot({
      token,
      scopes: integration.scopes ?? [],
      teamId,
      userId: normalizedMaintenance.value.userId,
    })
    try {
      const result = await ingestMaintenanceSlackEvent({
        integration,
        event: normalizedMaintenance.value,
        payload,
        reporter: {
          slackWorkspaceId: reporter.slackWorkspaceId ?? teamId,
          slackUserId: reporter.slackUserId ?? normalizedMaintenance.value.userId,
          displayName: reporter.displayName ?? null,
          realName: reporter.realName ?? null,
          username: reporter.username ?? null,
          avatarUrl: reporter.avatarUrl ?? null,
        },
        token,
      })
      return NextResponse.json({
        ok: true,
        maintenanceItemId: result.itemId,
        duplicate: result.duplicate,
      })
    } catch (error) {
      await db
        .from('fleet_maintenance_slack_events')
        .update({
          status: 'failed',
          error_message:
            error instanceof Error ? error.message.slice(0, 500) : 'Maintenance ingestion failed',
        })
        .eq('slack_event_id', normalizedMaintenance.value.eventId)
      return NextResponse.json({ error: 'Unable to persist maintenance event' }, { status: 503 })
    }
  }

  const normalized = normalizeSlackImageEvent(payload)
  if (normalized.kind === 'ignored') {
    await auditIgnored(payload, normalized.reason)
    return NextResponse.json({ ok: true, ignored: normalized.reason })
  }
  const event = normalized.value
  const driver = await resolveSlackUserSnapshot({
    token,
    scopes: integration.scopes ?? [],
    teamId: event.teamId,
    userId: event.userId,
  })
  const jobDriver = {
    slackWorkspaceId: driver.slackWorkspaceId ?? event.teamId,
    slackUserId: driver.slackUserId ?? event.userId,
    displayName: driver.displayName ?? null,
    realName: driver.realName ?? null,
    username: driver.username ?? null,
    avatarUrl: driver.avatarUrl ?? null,
  }

  const uploadSourceKey = `${integration.tenant_id}:${event.teamId}:${event.channelId}:${event.messageTs}`
  const ingestResult = await ingestSlackEvent({
    db,
    integrationId: integration.id,
    event,
    payload,
    title: event.text.trim().slice(0, 200) || 'Slack van damage inspection',
    driver: jobDriver,
    uploadSourceKey,
  })
  const ingestRows = ingestResult.rows
  const ingestError = ingestResult.error
  const ingest = ingestRows?.[0]
  if (ingestError || !ingest?.job_row_id || !ingest.inspection_row_id) {
    return NextResponse.json({ error: 'Unable to persist Slack event' }, { status: 503 })
  }
  if (ingest.existing_sqs_message_id) {
    return NextResponse.json({ ok: true, duplicate: true })
  }
  const slackMessageText = event.text.slice(0, 4_000)

  const job: VanDamageJobV1 = {
    version: 'v1',
    jobType: 'van_damage_slack_inspection',
    jobId: ingest.job_row_id,
    tenantId: integration.tenant_id,
    businessId: integration.business_id,
    integrationId: integration.id,
    inspectionId: ingest.inspection_row_id,
    slackTeamId: event.teamId,
    slackChannelId: event.channelId,
    slackMessageTs: event.messageTs,
    slackThreadTs: event.threadTs,
    slackEventId: event.eventId,
    slackMessageText,
    slackFileIds: event.files.map((file) => file.id),
    uploadSessionId: ingest.upload_session_row_id,
    uploadSourceKey,
    slackUploadIso: slackTsToIso(event.messageTs),
    slackDriver: jobDriver,
    createdAt: new Date().toISOString(),
  }

  const [jobUpdate, inspectionUpdate] = await Promise.all([
    db
      .from('van_damage_jobs')
      .update({ payload: job as unknown as Json, last_error: null })
      .eq('id', job.jobId),
    db
      .from('van_damage_inspections')
      .update({
        metadata: {
          slackEventId: event.eventId,
          slackMessageText,
          ...(ingestResult.usedPhase3dSchema
            ? {
                driver: jobDriver,
                uploadSourceKey: job.uploadSourceKey,
                slackUploadIso: job.slackUploadIso,
              }
            : {
                phase3dMigrationPending: true,
              }),
        } as Json,
      })
      .eq('id', job.inspectionId)
      .eq('tenant_id', job.tenantId)
      .eq('business_id', job.businessId),
  ])
  if (jobUpdate.error || inspectionUpdate.error) {
    return NextResponse.json({ error: 'Unable to persist Slack job payload' }, { status: 503 })
  }
  try {
    const messageId = await sendVanDamageJob(job)
    await Promise.all([
      db
        .from('van_damage_jobs')
        .update({ sqs_message_id: messageId, status: 'queued', last_error: null })
        .eq('id', job.jobId),
      db
        .from('van_damage_slack_events')
        .update({ status: 'enqueued', error_message: null })
        .eq('slack_event_id', event.eventId),
    ])
    return NextResponse.json({ ok: true, duplicate: !ingest.was_created })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'SQS enqueue failed'
    await Promise.all([
      db
        .from('van_damage_jobs')
        .update({ status: 'queued', last_error: message })
        .eq('id', job.jobId),
      db
        .from('van_damage_slack_events')
        .update({ status: 'enqueue_failed', error_message: message })
        .eq('slack_event_id', event.eventId),
    ])
    return NextResponse.json({ error: 'Queue temporarily unavailable' }, { status: 503 })
  }
}
