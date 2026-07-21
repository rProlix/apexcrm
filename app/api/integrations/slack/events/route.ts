import { NextRequest, NextResponse } from 'next/server'
import { getSlackEventsEnv } from '@/lib/server/env'
import { verifySlackSignature } from '@/lib/server/slack/signature'
import {
  normalizeSlackImageEvent,
  sanitizeSlackEvent,
  type SlackEventEnvelope,
} from '@/lib/server/slack/events'
import { getSlackUserInfo } from '@/lib/server/slack/api'
import { decryptSecret, type EncryptedSecret } from '@/lib/server/crypto/encrypt-token'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { sendVanDamageJob } from '@/lib/server/aws/sqs'
import { slackTsToIso, type SlackDriverSnapshot } from '@/lib/van-damage/history'
import type { VanDamageJobV1 } from '@/lib/van-damage/contracts'
import type { Json } from '@/lib/supabase/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function resolveDriverSnapshot(input: {
  token: string
  scopes: string[]
  teamId: string
  userId: string | null
}): Promise<SlackDriverSnapshot> {
  const fallback: SlackDriverSnapshot = {
    slackWorkspaceId: input.teamId,
    slackUserId: input.userId,
  }
  if (!input.userId || !input.scopes.includes('users:read')) return fallback
  try {
    const user = await getSlackUserInfo(input.token, input.userId)
    return {
      slackWorkspaceId: input.teamId,
      slackUserId: input.userId,
      displayName: user?.profile?.display_name || null,
      realName: user?.profile?.real_name || user?.real_name || null,
      username: user?.name || null,
      avatarUrl: user?.profile?.image_72 || null,
    }
  } catch {
    return fallback
  }
}

async function auditIgnored(payload: SlackEventEnvelope, reason: string) {
  if (!payload.team_id || !payload.event_id) return
  const db = getVanDamageServiceClient()
  const { data: integration } = await db.from('van_slack_integrations')
    .select('id, tenant_id, business_id')
    .eq('slack_team_id', payload.team_id)
    .eq('status', 'connected')
    .is('deleted_at', null)
    .maybeSingle()
  await db.from('van_damage_slack_events').upsert({
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
  }, { onConflict: 'slack_event_id', ignoreDuplicates: true })
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

  const normalized = normalizeSlackImageEvent(payload)
  if (normalized.kind === 'ignored') {
    await auditIgnored(payload, normalized.reason)
    return NextResponse.json({ ok: true, ignored: normalized.reason })
  }

  const event = normalized.value
  const db = getVanDamageServiceClient()
  const { data: integration, error: integrationError } = await db
    .from('van_slack_integrations')
    .select('id, tenant_id, business_id, slack_team_id, encrypted_bot_token, scopes')
    .eq('slack_team_id', event.teamId)
    .eq('status', 'connected')
    .is('deleted_at', null)
    .maybeSingle()
  if (integrationError) return NextResponse.json({ error: 'Integration lookup failed' }, { status: 503 })
  if (!integration) {
    await auditIgnored(payload, 'workspace_not_connected')
    return NextResponse.json({ ok: true, ignored: 'workspace_not_connected' })
  }

  const { data: allowedChannel } = await db.from('van_slack_channels')
    .select('id')
    .eq('integration_id', integration.id)
    .eq('slack_channel_id', event.channelId)
    .eq('is_enabled', true)
    .maybeSingle()
  if (!allowedChannel) {
    await auditIgnored(payload, 'channel_not_selected')
    return NextResponse.json({ ok: true, ignored: 'channel_not_selected' })
  }
  const driver = await resolveDriverSnapshot({
    token: decryptSecret(integration.encrypted_bot_token as EncryptedSecret),
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
  if (event.userId) {
    await (db as never as { from: (table: string) => { upsert: (value: unknown, options: unknown) => Promise<unknown> } }).from('van_slack_user_profiles').upsert({
      tenant_id: integration.tenant_id,
      business_id: integration.business_id,
      slack_team_id: event.teamId,
      slack_user_id: event.userId,
      display_name: jobDriver.displayName,
      real_name: jobDriver.realName,
      username: jobDriver.username,
      avatar_url: jobDriver.avatarUrl,
      last_resolved_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,slack_team_id,slack_user_id' })
  }

  const { data: ingestRows, error: ingestError } = await db.rpc('ingest_van_damage_slack_event', {
    p_integration_id: integration.id,
    p_slack_event_id: event.eventId,
    p_slack_event_type: event.eventType,
    p_slack_channel_id: event.channelId,
    p_slack_user_id: event.userId,
    p_raw_event: sanitizeSlackEvent(payload) as Json,
    p_slack_message_ts: event.messageTs,
    p_slack_thread_ts: event.threadTs,
    p_title: event.text.trim().slice(0, 200) || 'Slack van damage inspection',
    p_driver_profile: jobDriver as Json,
    p_upload_source_key: `${integration.tenant_id}:${event.teamId}:${event.channelId}:${event.messageTs}`,
    p_files: event.files.map((file) => ({
      id: file.id,
      name: file.name,
      mimetype: file.mimetype,
      size: file.size,
      width: file.width,
      height: file.height,
      url: file.url,
      fileAccess: file.fileAccess,
    })) as Json,
  })
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
    uploadSessionId: (ingest as { upload_session_row_id?: string }).upload_session_row_id,
    uploadSourceKey: `${integration.tenant_id}:${event.teamId}:${event.channelId}:${event.messageTs}`,
    slackUploadIso: slackTsToIso(event.messageTs),
    slackDriver: jobDriver,
    createdAt: new Date().toISOString(),
  }

  const [jobUpdate, inspectionUpdate] = await Promise.all([
    db.from('van_damage_jobs').update({ payload: job as unknown as Json, last_error: null }).eq('id', job.jobId),
    db.from('van_damage_inspections').update({
      metadata: {
        slackEventId: event.eventId,
        slackMessageText,
        driver: jobDriver,
        uploadSourceKey: job.uploadSourceKey,
        slackUploadIso: job.slackUploadIso,
      } as Json,
    }).eq('id', job.inspectionId).eq('tenant_id', job.tenantId).eq('business_id', job.businessId),
  ])
  if (jobUpdate.error || inspectionUpdate.error) {
    return NextResponse.json({ error: 'Unable to persist Slack job payload' }, { status: 503 })
  }
  try {
    const messageId = await sendVanDamageJob(job)
    await Promise.all([
      db.from('van_damage_jobs').update({ sqs_message_id: messageId, status: 'queued', last_error: null }).eq('id', job.jobId),
      db.from('van_damage_slack_events').update({ status: 'enqueued', error_message: null }).eq('slack_event_id', event.eventId),
    ])
    return NextResponse.json({ ok: true, duplicate: !ingest.was_created })
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'SQS enqueue failed'
    await Promise.all([
      db.from('van_damage_jobs').update({ status: 'queued', last_error: message }).eq('id', job.jobId),
      db.from('van_damage_slack_events').update({ status: 'enqueue_failed', error_message: message }).eq('slack_event_id', event.eventId),
    ])
    return NextResponse.json({ error: 'Queue temporarily unavailable' }, { status: 503 })
  }
}
