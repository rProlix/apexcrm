// lib/domain/getTenantDomainConfig.ts
// Returns the full domain configuration for a tenant: all domain rows,
// the primary domain, subdomain URL, custom domain URL, and verification state.

import { getSupabaseServerClient } from '@/lib/supabase/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourcrm.com'

export interface DomainEntry {
  id:                  string
  tenant_id:           string
  hostname:            string
  domain_type:         'subdomain' | 'custom'
  is_primary:          boolean
  is_verified:         boolean
  verified:            boolean
  verification_token:  string | null
  verification_method: string | null
  ssl_status:          'pending' | 'active' | 'failed'
  last_verified_at:    string | null
  metadata:            Record<string, unknown>
  created_at:          string
  updated_at:          string
}

export interface TenantDomainConfig {
  tenantId:       string
  slug:           string
  subdomainUrl:   string
  customDomain:   string | null
  customDomainUrl: string | null
  primaryDomain:  string
  primaryUrl:     string
  isCustomActive: boolean
  domains:        DomainEntry[]
}

/**
 * Fetches all domain entries for a tenant and computes the full config.
 */
export async function getTenantDomainConfig(tenantId: string): Promise<TenantDomainConfig | null> {
  const db = getSupabaseServerClient()

  const [tenantResult, domainsResult] = await Promise.all([
    db
      .from('tenants')
      .select('id, slug, custom_domain')
      .eq('id', tenantId)
      .eq('status', 'active')
      .maybeSingle(),
    db
      .from('tenant_domains')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true }),
  ])

  if (!tenantResult.data) return null

  const { slug } = tenantResult.data
  const domains  = (domainsResult.data ?? []) as DomainEntry[]

  const subdomainUrl  = `https://${slug}.${ROOT_DOMAIN}`
  const verifiedCustom = domains.find(
    (d) => d.domain_type === 'custom' && d.is_verified && d.ssl_status === 'active',
  )
  const primaryEntry  = domains.find((d) => d.is_primary) ?? domains[0]

  const customDomain    = verifiedCustom?.hostname ?? null
  const customDomainUrl = customDomain ? `https://${customDomain}` : null
  const primaryUrl      = customDomainUrl ?? subdomainUrl
  const primaryDomain   = verifiedCustom?.hostname ?? `${slug}.${ROOT_DOMAIN}`

  return {
    tenantId,
    slug,
    subdomainUrl,
    customDomain,
    customDomainUrl,
    primaryDomain,
    primaryUrl,
    isCustomActive: !!customDomain,
    domains,
  }
}
