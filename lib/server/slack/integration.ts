import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { decryptSecret, type EncryptedSecret } from '@/lib/server/crypto/encrypt-token'

export type SlackIntegrationRow = {
  id: string
  tenant_id: string
  business_id: string
  slack_team_id: string
  slack_team_name: string | null
  slack_bot_user_id: string | null
  slack_app_id: string | null
  encrypted_bot_token: EncryptedSecret
  token_last4: string | null
  scopes: string[]
  status: string
  connected_at: string
  last_tested_at: string | null
  last_event_at: string | null
  last_error: string | null
}

export async function loadActiveSlackIntegration(tenantId: string, businessId: string) {
  const db = getVanDamageServiceClient()
  const { data, error } = await db
    .from('van_slack_integrations')
    .select('id, tenant_id, business_id, slack_team_id, slack_team_name, slack_bot_user_id, slack_app_id, encrypted_bot_token, token_last4, scopes, status, connected_at, last_tested_at, last_event_at, last_error')
    .eq('tenant_id', tenantId)
    .eq('business_id', businessId)
    .eq('status', 'connected')
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as SlackIntegrationRow | null
}

export function decryptIntegrationToken(integration: SlackIntegrationRow) {
  return decryptSecret(integration.encrypted_bot_token)
}

export function publicIntegration(integration: SlackIntegrationRow | null) {
  if (!integration) return { connected: false as const }
  return {
    connected: true as const,
    id: integration.id,
    workspaceName: integration.slack_team_name,
    teamId: integration.slack_team_id,
    botUserId: integration.slack_bot_user_id,
    appId: integration.slack_app_id,
    scopes: integration.scopes,
    connectedAt: integration.connected_at,
    lastTestedAt: integration.last_tested_at,
    lastEventAt: integration.last_event_at,
    lastError: integration.last_error,
    tokenLast4: integration.token_last4,
  }
}
