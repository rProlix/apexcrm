import { getSupabaseServerClient } from '@/lib/supabase/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

export interface TenantRecord {
  id: string
  name: string
  slug: string
  subdomain: string | null
  custom_domain: string | null
  branding: Record<string, unknown>
  plan_id: string | null
  status: string
}

/**
 * Resolves the tenant for the current request host.
 *
 * Resolution order:
 * 1. Exact hostname match in tenant_domains table (covers custom domains + verified subdomains)
 * 2. Subdomain extraction from ROOT_DOMAIN (e.g. rentalco.yourcrm.com → slug=rentalco)
 * 3. Returns null if no tenant found (treated as platform root)
 */
export async function getTenantFromHost(host: string): Promise<TenantRecord | null> {
  const hostname = normalizeHost(host)

  let supabase: ReturnType<typeof getSupabaseServerClient>
  try {
    supabase = getSupabaseServerClient()
  } catch {
    // Supabase env vars not configured — treat as platform root (no tenant)
    return null
  }

  // 1. Lookup by exact hostname in tenant_domains
  const { data: domainRow } = await supabase
    .from('tenant_domains')
    .select('tenant_id, verified')
    .eq('hostname', hostname)
    .single()

  if (domainRow?.tenant_id && domainRow.verified) {
    return fetchTenantById(supabase, domainRow.tenant_id)
  }

  // 2. Extract subdomain from root domain
  const subdomain = extractSubdomain(hostname, ROOT_DOMAIN)
  if (subdomain) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('*')
      .eq('subdomain', subdomain)
      .eq('status', 'active')
      .single()

    return (tenant ?? null) as TenantRecord | null
  }

  return null
}

async function fetchTenantById(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string
): Promise<TenantRecord | null> {
  const { data } = await supabase
    .from('tenants')
    .select('*')
    .eq('id', tenantId)
    .eq('status', 'active')
    .single()
  return (data ?? null) as TenantRecord | null
}

function normalizeHost(host: string): string {
  // Strip port number if present
  return host.split(':')[0].toLowerCase()
}

function extractSubdomain(hostname: string, rootDomain: string): string | null {
  // Handle localhost subdomains: rentalco.localhost
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace(/\.localhost$/, '')
    return sub || null
  }

  // Handle rootDomain subdomains: rentalco.yourcrm.com
  const suffix = `.${rootDomain}`
  if (hostname.endsWith(suffix)) {
    const sub = hostname.slice(0, hostname.length - suffix.length)
    return sub || null
  }

  return null
}
