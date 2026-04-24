// lib/domain/resolveTenantByHost.ts
// Enhanced tenant resolution that returns both the tenant record and its
// matched domain row.  Used by server components and API routes that need
// the full domain config alongside the tenant.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeHost }            from './normalizeHost'
import { isPlatformRoot }           from './isPlatformRoot'
import { extractSlugFromSubdomain } from './isPlatformSubdomain'

export interface TenantDomainRow {
  id:                  string
  tenant_id:           string
  hostname:            string
  domain_type:         'subdomain' | 'custom'
  is_primary:          boolean
  is_verified:         boolean
  verification_token:  string | null
  verification_method: string | null
  ssl_status:          'pending' | 'active' | 'failed'
  last_verified_at:    string | null
  metadata:            Record<string, unknown>
  created_at:          string
  updated_at:          string
}

export interface TenantRecord {
  id:            string
  name:          string
  slug:          string
  subdomain:     string | null
  custom_domain: string | null
  branding:      Record<string, unknown>
  plan_id:       string | null
  status:        string
}

export interface ResolvedTenantContext {
  tenant:     TenantRecord
  domainRow:  TenantDomainRow | null
  /** The key that was used to resolve the tenant (slug or hostname). */
  resolvedBy: 'custom_domain' | 'subdomain' | 'slug'
}

/**
 * Resolves the tenant and matching domain configuration from an HTTP Host
 * header value.
 *
 * Resolution order:
 *  1. Verified custom domain  → tenant_domains (domain_type='custom', is_verified=true)
 *  2. Platform subdomain      → *.yourcrm.com or *.localhost → tenants.slug
 *  3. localhost bare          → optional tenantSlug fallback (local dev)
 *  4. Unknown host            → null
 */
export async function resolveTenantByHost(
  host: string,
  tenantSlugFallback?: string | null,
): Promise<ResolvedTenantContext | null> {
  const hostname = normalizeHost(host)

  if (isPlatformRoot(hostname)) {
    if (tenantSlugFallback) {
      return resolveBySlug(tenantSlugFallback, null)
    }
    return null
  }

  const db = getSupabaseServerClient()

  // 1. Verified custom domain
  const { data: domainRow } = await db
    .from('tenant_domains')
    .select('*')
    .eq('hostname', hostname)
    .eq('domain_type', 'custom')
    .eq('is_verified', true)
    .maybeSingle()

  if (domainRow) {
    const tenant = await fetchTenantById(db, domainRow.tenant_id)
    if (!tenant) return null
    return {
      tenant,
      domainRow: domainRow as TenantDomainRow,
      resolvedBy: 'custom_domain',
    }
  }

  // 2. Platform subdomain
  const slug = extractSlugFromSubdomain(hostname)
  if (slug) {
    return resolveBySlug(slug, null)
  }

  return null
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function resolveBySlug(
  slug: string,
  domainRow: TenantDomainRow | null,
): Promise<ResolvedTenantContext | null> {
  const db = getSupabaseServerClient()

  const { data: tenant } = await db
    .from('tenants')
    .select('id, name, slug, subdomain, custom_domain, branding, plan_id, status')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()

  if (!tenant) return null

  // Fetch the subdomain domain row for this tenant
  const { data: subdomainRow } = await db
    .from('tenant_domains')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('domain_type', 'subdomain')
    .maybeSingle()

  return {
    tenant: tenant as TenantRecord,
    domainRow: (domainRow ?? subdomainRow ?? null) as TenantDomainRow | null,
    resolvedBy: 'subdomain',
  }
}

async function fetchTenantById(
  db: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<TenantRecord | null> {
  const { data } = await db
    .from('tenants')
    .select('id, name, slug, subdomain, custom_domain, branding, plan_id, status')
    .eq('id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  return data as TenantRecord | null
}
