import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { getSlackOAuthEnv } from '@/lib/server/env'
import { createSlackOAuthState } from '@/lib/server/slack/oauth-state'

export const runtime = 'nodejs'

const SLACK_SCOPES = [
  'files:read', 'chat:write', 'channels:read', 'channels:history',
  'groups:read', 'groups:history', 'users:read', 'team:read',
]

export async function GET(request: NextRequest) {
  const access = await resolveVanDamageAccess(request.nextUrl.searchParams.get('businessId'), { manage: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { clientId, appUrl } = getSlackOAuthEnv()
  const { state, payload } = createSlackOAuthState({
    tenantId: access.tenantId,
    businessId: access.businessId,
    userId: access.userId,
  })
  const cookieStore = await cookies()
  cookieStore.set('van_slack_oauth_nonce', payload.nonce, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/integrations/slack/oauth',
    maxAge: 10 * 60,
  })

  const redirectUri = `${appUrl}/api/integrations/slack/oauth/callback`
  const url = new URL('https://slack.com/oauth/v2/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('scope', SLACK_SCOPES.join(','))
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  return NextResponse.redirect(url)
}
