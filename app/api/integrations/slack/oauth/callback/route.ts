import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSlackOAuthEnv } from '@/lib/server/env'
import { verifySlackOAuthState } from '@/lib/server/slack/oauth-state'
import { resolveVanDamageAccess } from '@/lib/server/van-damage/access'
import { encryptSecret } from '@/lib/server/crypto/encrypt-token'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'

export const runtime = 'nodejs'

type OAuthResponse = {
  ok: boolean
  error?: string
  access_token?: string
  scope?: string
  bot_user_id?: string
  app_id?: string
  team?: { id?: string; name?: string }
}

function redirectResult(appUrl: string, businessId: string | null, result: string) {
  const target = new URL('/dashboard/damage-ai/settings/slack', appUrl)
  if (businessId) target.searchParams.set('businessId', businessId)
  target.searchParams.set('slack', result)
  return NextResponse.redirect(target)
}

export async function GET(request: NextRequest) {
  const { clientId, clientSecret, appUrl } = getSlackOAuthEnv()
  const stateValue = request.nextUrl.searchParams.get('state')
  const code = request.nextUrl.searchParams.get('code')
  const providerError = request.nextUrl.searchParams.get('error')
  if (providerError) return redirectResult(appUrl, null, `error_${providerError}`)
  if (!stateValue || !code) return redirectResult(appUrl, null, 'error_missing_code')

  const cookieStore = await cookies()
  const nonce = cookieStore.get('van_slack_oauth_nonce')?.value
  cookieStore.delete('van_slack_oauth_nonce')
  if (!nonce) return redirectResult(appUrl, null, 'error_invalid_state')

  let state
  try {
    state = verifySlackOAuthState(stateValue, nonce)
  } catch {
    return redirectResult(appUrl, null, 'error_invalid_state')
  }

  const access = await resolveVanDamageAccess(state.businessId, { manage: true })
  if (!access.ok || access.userId !== state.userId || access.tenantId !== state.tenantId) {
    return redirectResult(appUrl, state.businessId, 'error_forbidden')
  }

  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      redirect_uri: `${appUrl}/api/integrations/slack/oauth/callback`,
    }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null)
  if (!response?.ok) return redirectResult(appUrl, state.businessId, 'error_exchange_failed')

  const oauth = await response.json() as OAuthResponse
  const token = oauth.access_token
  const teamId = oauth.team?.id
  if (!oauth.ok || !token || !teamId) {
    return redirectResult(appUrl, state.businessId, `error_${oauth.error ?? 'invalid_response'}`)
  }

  const db = getVanDamageServiceClient()
  const save = await db.rpc('save_van_slack_integration', {
    p_tenant_id: access.tenantId,
    p_business_id: access.businessId,
    p_slack_team_id: teamId,
    p_slack_team_name: oauth.team?.name ?? null,
    p_slack_bot_user_id: oauth.bot_user_id ?? null,
    p_slack_app_id: oauth.app_id ?? null,
    p_encrypted_bot_token: encryptSecret(token),
    p_token_last4: token.slice(-4),
    p_scopes: (oauth.scope ?? '').split(',').map((scope) => scope.trim()).filter(Boolean),
    p_connected_by: access.userId,
  })
  if (save.error) {
    const reason = save.error.message.includes('another business') ? 'error_workspace_already_connected' : 'error_save_failed'
    return redirectResult(appUrl, state.businessId, reason)
  }

  return redirectResult(appUrl, state.businessId, 'connected')
}
