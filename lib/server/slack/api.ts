type SlackResponse = { ok: boolean; error?: string; response_metadata?: { next_cursor?: string } }

export async function callSlackApi<T extends SlackResponse>(
  method: string,
  token: string,
  body: Record<string, string | number | boolean | undefined> = {},
): Promise<T> {
  const response = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(
      Object.entries(body)
        .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
        .map(([key, value]) => [key, String(value)]),
    ),
    signal: AbortSignal.timeout(8_000),
  })
  if (!response.ok) throw new Error(`Slack API HTTP ${response.status}`)
  const payload = await response.json() as T
  if (!payload.ok) throw new Error(`Slack API ${method} failed: ${payload.error ?? 'unknown_error'}`)
  return payload
}

export type SlackChannel = {
  id: string
  name: string
  is_private?: boolean
  is_member?: boolean
  is_archived?: boolean
}

export async function listSlackChannels(token: string): Promise<SlackChannel[]> {
  const channels: SlackChannel[] = []
  let cursor = ''
  do {
    const response = await callSlackApi<SlackResponse & { channels?: SlackChannel[] }>(
      'conversations.list',
      token,
      { types: 'public_channel,private_channel', exclude_archived: true, limit: 200, cursor: cursor || undefined },
    )
    channels.push(...(response.channels ?? []).filter((channel) => !channel.is_archived))
    cursor = response.response_metadata?.next_cursor?.trim() ?? ''
  } while (cursor)
  return channels.sort((a, b) => a.name.localeCompare(b.name))
}

export type SlackUserProfile = {
  id: string
  team_id?: string
  name?: string
  real_name?: string
  profile?: {
    display_name?: string
    real_name?: string
    image_72?: string
  }
}

export async function getSlackUserInfo(token: string, userId: string): Promise<SlackUserProfile | null> {
  const response = await callSlackApi<SlackResponse & { user?: SlackUserProfile }>(
    'users.info',
    token,
    { user: userId },
  )
  return response.user ?? null
}
