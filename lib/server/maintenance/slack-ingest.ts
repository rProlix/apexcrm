import type { NormalizedSlackMessageEvent, SlackEventEnvelope } from '@/lib/server/slack/events'
import { sanitizeSlackEvent } from '@/lib/server/slack/events'
import { persistSlackMaintenanceAttachments } from '@/lib/server/maintenance/attachments'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { slackTsToIso } from '@/lib/van-damage/history'
import { extractVanNumber } from '@/workers/van-damage-worker/src/van-number-parser'
import { maintenanceTitle, triageMaintenanceReport } from '@/lib/maintenance/triage'
import type { Json } from '@/lib/supabase/types'

type Integration = {
  id: string
  tenant_id: string
  business_id: string
}

type IngestRow = {
  maintenance_item_id: string | null
  history_event_id?: string | null
  was_created?: boolean
  event_kind?: string
  was_applied?: boolean
}

function asJsonFile(file: NormalizedSlackMessageEvent['files'][number]) {
  return {
    id: file.id,
    name: file.name,
    mimetype: file.mimetype,
    size: file.size,
  }
}

export async function ingestMaintenanceSlackEvent(input: {
  integration: Integration
  event: NormalizedSlackMessageEvent
  payload: SlackEventEnvelope
  reporter: Record<string, unknown>
  token: string
}) {
  const db = getVanDamageServiceClient()
  const occurredAt = slackTsToIso(input.event.messageTs) ?? new Date().toISOString()

  if (input.event.eventType !== 'message') {
    const result = (await db.rpc('record_fleet_maintenance_slack_mutation', {
      p_integration_id: input.integration.id,
      p_slack_event_id: input.event.eventId,
      p_slack_team_id: input.event.teamId,
      p_slack_channel_id: input.event.channelId,
      p_slack_message_ts: input.event.messageTs,
      p_slack_thread_ts: input.event.threadTs,
      p_event_kind: input.event.eventType,
      p_text: input.event.text,
      p_previous_text: input.event.previousText,
      p_reporter_snapshot: input.reporter as Json,
      p_occurred_at: occurredAt,
      p_raw_event: sanitizeSlackEvent(input.payload) as Json,
    })) as unknown as { data: IngestRow[] | null; error: { message: string } | null }
    if (result.error) throw new Error(result.error.message)
    return {
      itemId: result.data?.[0]?.maintenance_item_id ?? null,
      duplicate: !result.data?.[0]?.was_applied,
    }
  }

  let vanId: string | null = null
  const vanNumber = extractVanNumber(input.event.text)
  if (vanNumber) {
    const { data: vans } = await db
      .from('vehicles')
      .select('id')
      .eq('tenant_id', input.integration.tenant_id)
      .ilike('van_number', vanNumber)
      .limit(2)
    if (vans?.length === 1) vanId = vans[0].id
  }

  const triage = triageMaintenanceReport(input.event.text)
  const result = (await db.rpc('ingest_fleet_maintenance_slack_message', {
    p_integration_id: input.integration.id,
    p_slack_event_id: input.event.eventId,
    p_slack_team_id: input.event.teamId,
    p_slack_channel_id: input.event.channelId,
    p_slack_user_id: input.event.userId,
    p_slack_message_ts: input.event.messageTs,
    p_slack_thread_ts: input.event.threadTs,
    p_text: input.event.text,
    p_title: maintenanceTitle(input.event.text, triage),
    p_reporter_snapshot: input.reporter as Json,
    p_reported_at: occurredAt,
    p_van_id: vanId,
    p_triage: triage as unknown as Json,
    p_files: input.event.files.map(asJsonFile) as Json,
    p_raw_event: sanitizeSlackEvent(input.payload) as Json,
  })) as unknown as { data: IngestRow[] | null; error: { message: string } | null }
  if (result.error) throw new Error(result.error.message)

  const row = result.data?.[0]
  if (row?.maintenance_item_id && input.event.files.length) {
    await persistSlackMaintenanceAttachments({
      token: input.token,
      tenantId: input.integration.tenant_id,
      businessId: input.integration.business_id,
      itemId: row.maintenance_item_id,
      files: input.event.files,
    })
  }
  return { itemId: row?.maintenance_item_id ?? null, duplicate: row?.was_created === false }
}
