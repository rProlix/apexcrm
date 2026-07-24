import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolveSlackChannelPurpose } from '../../server/slack/channel-routing'
import { normalizeSlackMessageEvent } from '../../server/slack/events'
import { resolveFirstDetectedAttribution } from '../../van-damage/first-attribution'
import { extractVanNumber } from '../../../workers/van-damage-worker/src/van-number-parser'

test('channel purpose routing is exclusive and maintenance messages do not require images', () => {
  assert.equal(resolveSlackChannelPurpose('damage_inspection'), 'damage_inspection')
  assert.equal(resolveSlackChannelPurpose('maintenance'), 'maintenance')
  assert.equal(resolveSlackChannelPurpose('unknown'), null)
  const normalized = normalizeSlackMessageEvent({
    type: 'event_callback',
    team_id: 'T1',
    event_id: 'Ev1',
    event: {
      type: 'message',
      channel: 'C1',
      user: 'U1',
      ts: '1.0001',
      text: '64 has a coolant leak',
    },
  })
  assert.equal(normalized.kind, 'message')
  assert.equal(extractVanNumber('64 has a coolant leak'), '64')
})

test('Slack settings preserve unhealthy mappings and verify access before routing', () => {
  const settingsRoute = readFileSync('app/api/integrations/slack/channels/route.ts', 'utf8')
  const eventRoute = readFileSync('app/api/integrations/slack/events/route.ts', 'utf8')
  const settingsUi = readFileSync('components/van-damage/SlackSettingsClient.tsx', 'utf8')
  const channelSelection = readFileSync('lib/slack/channel-selection.ts', 'utf8')
  assert.match(settingsRoute, /maintenanceEnabled/)
  assert.match(settingsRoute, /isAccessible: false/)
  assert.match(settingsRoute, /slack_channel_configuration_tested/)
  assert.match(settingsRoute, /validateSlackChannelSelection/)
  assert.match(channelSelection, /same Slack channel cannot be used for both/)
  assert.match(eventRoute, /getSlackChannelInfo/)
  assert.match(eventRoute, /channel_access_unverified/)
  assert.match(settingsUi, /Search available Slack channels/)
  assert.match(settingsUi, /Enable ingestion/)
  assert.match(settingsUi, /Test routing/)
})

test('thread replies, edits, and deletions preserve the source message identity', () => {
  const reply = normalizeSlackMessageEvent({
    type: 'event_callback',
    team_id: 'T1',
    event_id: 'EvReply',
    event: {
      type: 'message',
      channel: 'C1',
      user: 'U2',
      ts: '2.0001',
      thread_ts: '1.0001',
      text: 'Parts ordered',
    },
  })
  assert.equal(reply.kind, 'message')
  if (reply.kind === 'message') assert.equal(reply.value.threadTs, '1.0001')

  const edit = normalizeSlackMessageEvent({
    type: 'event_callback',
    team_id: 'T1',
    event_id: 'EvEdit',
    event: {
      type: 'message',
      subtype: 'message_changed',
      channel: 'C1',
      message: { user: 'U1', ts: '1.0001', text: 'Van 64 needs a tire' },
      previous_message: { user: 'U1', ts: '1.0001', text: 'Van 64 needs service' },
    },
  })
  assert.equal(edit.kind, 'message_changed')
  if (edit.kind === 'message_changed') assert.equal(edit.value.previousText, 'Van 64 needs service')

  const deletion = normalizeSlackMessageEvent({
    type: 'event_callback',
    team_id: 'T1',
    event_id: 'EvDelete',
    event: {
      type: 'message',
      subtype: 'message_deleted',
      channel: 'C1',
      deleted_ts: '1.0001',
      previous_message: { user: 'U1', ts: '1.0001', text: 'Van 64 needs service' },
    },
  })
  assert.equal(deletion.kind, 'message_deleted')
  if (deletion.kind === 'message_deleted') assert.equal(deletion.value.messageTs, '1.0001')
})

test('first-detected attribution is chronological, stable, and excludes dismissed evidence', () => {
  const attribution = resolveFirstDetectedAttribution([
    {
      id: 'b',
      inspectionId: 'later',
      observedAt: '2026-07-23T12:00:00Z',
      slackMessageAt: '2026-07-23T11:00:00Z',
      reporter: { slackUserId: 'U2' },
    },
    {
      id: 'a',
      inspectionId: 'first',
      uploadSessionId: 'session-1',
      evidenceImageId: 'image-1',
      observedAt: '2026-07-23T10:05:00Z',
      slackFileAt: '2026-07-23T10:00:00Z',
      reporter: { slackUserId: 'U1' },
    },
    {
      id: 'dismissed',
      inspectionId: 'invalid',
      observedAt: '2026-07-23T08:00:00Z',
      dismissed: true,
      reporter: { slackUserId: 'U0' },
    },
  ])
  assert.equal(attribution?.inspectionId, 'first')
  assert.equal(attribution?.sourceTimestampKind, 'slack_file')
  assert.equal(attribution?.reporter?.slackUserId, 'U1')
})

test('repaired and recurrent cases resolve independent earliest observations', () => {
  const original = resolveFirstDetectedAttribution([
    { id: 'a', inspectionId: 'old', observedAt: '2026-07-01T10:00:00Z' },
  ])
  const recurrence = resolveFirstDetectedAttribution([
    { id: 'b', inspectionId: 'new', observedAt: '2026-07-23T10:00:00Z' },
  ])
  assert.equal(original?.inspectionId, 'old')
  assert.equal(recurrence?.inspectionId, 'new')
})

test('migration enforces tenant scope, idempotency, concurrency locks, and Slack history preservation', () => {
  const migration = readFileSync(
    'supabase/migrations/20260723090000_level3_attribution_fleet_maintenance.sql',
    'utf8'
  )
  assert.match(
    migration,
    /UNIQUE \(tenant_id, slack_team_id, slack_channel_id, slack_message_ts\)|fleet_maintenance_slack_source_uidx/
  )
  assert.match(migration, /slack_event_id\s+text NOT NULL UNIQUE/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /source_slack_message_deleted/)
  assert.match(migration, /business_id = tenant_id/)
  assert.match(migration, /purpose = 'maintenance'/)
  const attachments = readFileSync('lib/server/maintenance/attachments.ts', 'utf8')
  const download = readFileSync(
    'app/api/fleet/maintenance/attachments/[attachmentId]/route.ts',
    'utf8'
  )
  assert.match(attachments, /ServerSideEncryption: 'AES256'/)
  assert.match(download, /getCachedPrivateMediaSignedUrl/)
  assert.match(download, /SIGNED_URL_TTL_SECONDS = 15 \* 60/)
  assert.match(download, /'Cache-Control': `private,/)
  assert.doesNotMatch(migration, /url_private|signed_url/)
})
