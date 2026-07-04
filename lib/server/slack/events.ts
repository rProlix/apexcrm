import { VAN_DAMAGE_IMAGE_MIME_TYPES } from '@/lib/van-damage/contracts'

type SlackFile = {
  id?: string
  name?: string
  mimetype?: string
  size?: number
  original_w?: number
  original_h?: number
  url_private_download?: string
  url_private?: string
  file_access?: string
  mode?: string
}

export type SlackEventEnvelope = {
  type?: string
  challenge?: string
  team_id?: string
  event_id?: string
  event?: {
    type?: string
    subtype?: string
    hidden?: boolean
    bot_id?: string
    channel?: string
    channel_id?: string
    user?: string
    user_id?: string
    text?: string
    ts?: string
    event_ts?: string
    thread_ts?: string
    files?: SlackFile[]
  }
  [key: string]: unknown
}

export type NormalizedSlackImageEvent = {
  teamId: string
  eventId: string
  eventType: string
  channelId: string
  userId: string | null
  messageTs: string
  threadTs: string | null
  text: string
  files: Array<{
    id: string
    name: string
    mimetype: string | null
    size: number | null
    width: number | null
    height: number | null
    url: string | null
    fileAccess: string | null
  }>
}

export function normalizeSlackImageEvent(payload: SlackEventEnvelope):
  | { kind: 'image_message'; value: NormalizedSlackImageEvent }
  | { kind: 'ignored'; reason: string; teamId?: string; eventId?: string; channelId?: string } {
  const event = payload.event
  const base = {
    teamId: payload.team_id,
    eventId: payload.event_id,
    channelId: event?.channel ?? event?.channel_id,
  }
  if (payload.type !== 'event_callback' || !event) return { kind: 'ignored', reason: 'not_event_callback', ...base }
  if (event.type === 'file_shared') return { kind: 'ignored', reason: 'standalone_file_shared', ...base }
  if (event.type !== 'message') return { kind: 'ignored', reason: 'unsupported_event_type', ...base }
  if (event.hidden || event.bot_id || ['bot_message', 'message_changed', 'message_deleted'].includes(event.subtype ?? '')) {
    return { kind: 'ignored', reason: 'bot_or_message_mutation', ...base }
  }
  if (!payload.team_id || !payload.event_id || !event.channel || !event.ts) {
    return { kind: 'ignored', reason: 'missing_required_identifiers', ...base }
  }

  const files = (event.files ?? []).flatMap((file) => {
    if (!file.id) return []
    const needsInfo = file.file_access === 'check_file_info' || file.mode === 'file_access'
    if (!needsInfo && (!file.mimetype || !VAN_DAMAGE_IMAGE_MIME_TYPES.includes(file.mimetype as typeof VAN_DAMAGE_IMAGE_MIME_TYPES[number]))) {
      return []
    }
    return [{
      id: file.id,
      name: file.name ?? file.id,
      mimetype: file.mimetype ?? null,
      size: Number.isFinite(file.size) ? file.size! : null,
      width: Number.isFinite(file.original_w) ? file.original_w! : null,
      height: Number.isFinite(file.original_h) ? file.original_h! : null,
      url: file.url_private_download ?? file.url_private ?? null,
      fileAccess: file.file_access ?? null,
    }]
  })
  if (!files.length) return { kind: 'ignored', reason: 'no_supported_images', ...base }

  return {
    kind: 'image_message',
    value: {
      teamId: payload.team_id,
      eventId: payload.event_id,
      eventType: event.type,
      channelId: event.channel,
      userId: event.user ?? null,
      messageTs: event.ts,
      threadTs: event.thread_ts ?? null,
      text: (event.text ?? '').slice(0, 4_000),
      files,
    },
  }
}

export function sanitizeSlackEvent(payload: SlackEventEnvelope): Record<string, unknown> {
  const event = payload.event
  return {
    type: payload.type,
    team_id: payload.team_id,
    event_id: payload.event_id,
    event: event ? {
      type: event.type,
      subtype: event.subtype,
      channel: event.channel ?? event.channel_id,
      user: event.user ?? event.user_id,
      ts: event.ts ?? event.event_ts,
      thread_ts: event.thread_ts,
      text: event.text?.slice(0, 4_000),
      files: event.files?.map((file) => ({
        id: file.id,
        name: file.name,
        mimetype: file.mimetype,
        size: file.size,
        original_w: file.original_w,
        original_h: file.original_h,
        file_access: file.file_access,
      })),
    } : undefined,
  }
}
