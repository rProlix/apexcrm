// lib/payments/getProviderAccount.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface ProviderAccount {
  id:                 string
  tenantId:           string
  providerKey:        string
  providerAccountId:  string | null
  accessToken:        string | null
  refreshToken:       string | null
  scope:              string | null
  expiresAt:          string | null
  status:             string
  connectionMethod:   string
  metadata:           Record<string, unknown>
}

/**
 * Returns the active OAuth/API-key account for a tenant + provider.
 * Access token is returned server-side only — never forwarded to the client.
 */
export async function getProviderAccount(
  tenantId:    string,
  providerKey: string
): Promise<ProviderAccount | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data, error } = await supabase
    .from('payment_accounts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('provider_key', providerKey)
    .eq('status', 'connected')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  return {
    id:                data.id,
    tenantId:          data.tenant_id,
    providerKey:       data.provider_key,
    providerAccountId: data.provider_account_id ?? null,
    accessToken:       data.access_token         ?? null,
    refreshToken:      data.refresh_token        ?? null,
    scope:             data.scope                ?? null,
    expiresAt:         data.expires_at           ?? null,
    status:            data.status               ?? 'connected',
    connectionMethod:  data.connection_method     ?? 'api_key',
    metadata:          (data.metadata ?? {}) as Record<string, unknown>,
  }
}

/**
 * Returns a safe public summary of a provider account (no tokens).
 */
export async function getProviderAccountPublic(
  tenantId:    string,
  providerKey: string
): Promise<{ connected: boolean; accountId: string | null; connectionMethod: string } | null> {
  const account = await getProviderAccount(tenantId, providerKey)
  if (!account) return null

  return {
    connected:        account.status === 'connected',
    accountId:        account.providerAccountId,
    connectionMethod: account.connectionMethod,
  }
}
