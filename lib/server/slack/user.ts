import { getSlackUserInfo } from '@/lib/server/slack/api'
import type { SlackDriverSnapshot } from '@/lib/van-damage/history'

export async function resolveSlackUserSnapshot(input: {
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
