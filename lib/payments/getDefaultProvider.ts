// lib/payments/getDefaultProvider.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { AdapterConfig, ProviderKey } from './adapters/paymentAdapter'

export interface ProviderInfo {
  providerKey:      ProviderKey
  config:           AdapterConfig
  accountId?:       string
  connectionMethod: 'oauth' | 'api_key'
}

/**
 * Merges a payment_providers row with a payment_accounts OAuth row.
 * OAuth access_token takes precedence over config.secretKey.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveConfig(supabase: any, tenantId: string, providerKey: string, providerCfg: Record<string, unknown>): Promise<{ config: AdapterConfig; connectionMethod: 'oauth' | 'api_key'; accountId?: string }> {
  // Check payment_accounts for an OAuth token first
  const { data: account } = await supabase
    .from('payment_accounts')
    .select('access_token, provider_account_id, connection_method')
    .eq('tenant_id', tenantId)
    .eq('provider_key', providerKey)
    .eq('status', 'connected')
    .maybeSingle()

  if (account?.access_token && account?.connection_method === 'oauth') {
    return {
      connectionMethod: 'oauth',
      accountId:        account.provider_account_id ?? undefined,
      config: {
        secretKey:     account.access_token,
        webhookSecret: providerCfg.webhookSecret as string | undefined,
        accountId:     account.provider_account_id ?? (providerCfg.accountId as string | undefined),
      },
    }
  }

  // Fall back to API key stored in payment_providers.config
  return {
    connectionMethod: 'api_key',
    accountId:        providerCfg.accountId as string | undefined,
    config: {
      secretKey:     providerCfg.secretKey as string,
      webhookSecret: providerCfg.webhookSecret as string | undefined,
      accountId:     providerCfg.accountId as string | undefined,
    },
  }
}

/**
 * Resolves the default (or specified) payment provider and its config for a
 * tenant. OAuth access_token takes precedence over stored API keys.
 * Returns null if no provider is connected or enabled.
 */
export async function getDefaultProvider(
  tenantId:     string,
  providerKey?: string
): Promise<ProviderInfo | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  let query = supabase
    .from('payment_providers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)

  if (providerKey) {
    query = query.eq('provider_key', providerKey)
  } else {
    query = query.eq('is_default', true)
  }

  const { data: providers } = await query.order('created_at').limit(1)
  let provider = providers?.[0]

  if (!provider) {
    // Fallback: return any enabled provider for this tenant
    const { data: fallback } = await supabase
      .from('payment_providers')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_enabled', true)
      .limit(1)
      .maybeSingle()

    if (!fallback) return null
    provider = fallback
  }

  const cfg      = (provider.config ?? {}) as Record<string, unknown>
  const resolved = await resolveConfig(supabase, tenantId, provider.provider_key, cfg)

  return {
    providerKey:      provider.provider_key as ProviderKey,
    connectionMethod: resolved.connectionMethod,
    accountId:        resolved.accountId,
    config:           resolved.config,
  }
}

/**
 * Get all enabled providers for a tenant with their configs (OAuth preferred).
 */
export async function getAllProviders(tenantId: string): Promise<ProviderInfo[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data: providers } = await supabase
    .from('payment_providers')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_enabled', true)
    .order('is_default', { ascending: false })

  if (!providers?.length) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = await Promise.all((providers as any[]).map(async (p: any) => {
    const cfg      = (p.config ?? {}) as Record<string, unknown>
    const resolved = await resolveConfig(supabase, tenantId, p.provider_key, cfg)
    return {
      providerKey:      p.provider_key as ProviderKey,
      connectionMethod: resolved.connectionMethod,
      accountId:        resolved.accountId,
      config:           resolved.config,
    }
  }))

  return results
}

/**
 * Get the config for a provider by tenantId and providerKey.
 * Used by webhook handlers.
 */
export async function getProviderConfig(
  tenantId:    string,
  providerKey: string
): Promise<AdapterConfig | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data } = await supabase
    .from('payment_providers')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('provider_key', providerKey)
    .eq('is_enabled', true)
    .maybeSingle()

  if (!data) return null

  const cfg      = (data.config ?? {}) as Record<string, unknown>
  const resolved = await resolveConfig(supabase, tenantId, providerKey, cfg)
  return resolved.config
}
