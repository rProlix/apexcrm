// lib/website/getSiteByHost.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { SiteByHostResult, SiteSettings } from './types'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourcrm.com'

interface TenantRow {
  id:            string
  name:          string
  slug:          string
  subdomain:     string | null
  custom_domain: string | null
  status:        string
}

/**
 * Resolves the tenant and site_settings for a given hostname.
 *
 * Resolution order:
 *  1. Exact match on site_settings.custom_domain   (tenant manages domain via builder)
 *  2. Verified match in tenant_domains              (legacy / manually verified)
 *  3. Subdomain of ROOT_DOMAIN → tenants.subdomain (e.g. acme.yourcrm.com)
 *  4. Subdomain match in site_settings.subdomain   (builder-assigned subdomain)
 *
 * Returns null when no tenant can be resolved — caller treats this as the
 * platform root and does not render a public storefront.
 */
export async function getSiteByHost(host: string): Promise<SiteByHostResult | null> {
  const hostname = normalizeHost(host)
  const db       = getSupabaseServerClient()

  // 1. Exact custom domain stored in site_settings
  {
    const { data } = await db
      .from('site_settings')
      .select('*')
      .eq('custom_domain', hostname)
      .maybeSingle()

    if (data) {
      const tenant = await fetchTenant(db, data.tenant_id)
      if (tenant) return buildResult(tenant, data as unknown as SiteSettings)
    }
  }

  // 2. Verified custom domain in tenant_domains
  {
    const { data: domainRow } = await db
      .from('tenant_domains')
      .select('tenant_id, verified')
      .eq('hostname', hostname)
      .eq('verified', true)
      .maybeSingle()

    if (domainRow?.tenant_id) {
      const [tenant, settings] = await Promise.all([
        fetchTenant(db, domainRow.tenant_id),
        fetchSiteSettings(db, domainRow.tenant_id),
      ])
      if (tenant) return buildResult(tenant, settings)
    }
  }

  // 3 & 4. Subdomain resolution
  const subdomain = extractSubdomain(hostname, ROOT_DOMAIN)
  if (subdomain) {
    // 3. Match tenants.subdomain (set at tenant creation)
    {
      const { data: tenant } = await db
        .from('tenants')
        .select('id, name, slug, subdomain, custom_domain, status')
        .eq('subdomain', subdomain)
        .eq('status', 'active')
        .maybeSingle()

      if (tenant) {
        const settings = await fetchSiteSettings(db, tenant.id)
        return buildResult(tenant as TenantRow, settings)
      }
    }

    // 4. Match site_settings.subdomain (builder-assigned)
    {
      const { data } = await db
        .from('site_settings')
        .select('*')
        .eq('subdomain', subdomain)
        .maybeSingle()

      if (data) {
        const tenant = await fetchTenant(db, data.tenant_id)
        if (tenant) return buildResult(tenant, data as unknown as SiteSettings)
      }
    }
  }

  return null
}

/**
 * Resolves the tenant and site_settings by tenant slug directly.
 * Faster than getSiteByHost when the slug is already known (e.g., from middleware).
 */
export async function getSiteBySlug(slug: string): Promise<SiteByHostResult | null> {
  const db = getSupabaseServerClient()

  const { data: tenant } = await db
    .from('tenants')
    .select('id, name, slug, subdomain, custom_domain, status')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()

  if (!tenant) return null

  const settings = await fetchSiteSettings(db, tenant.id)
  return buildResult(tenant as TenantRow, settings)
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function buildResult(tenant: TenantRow, settings: SiteSettings | null): SiteByHostResult {
  return {
    tenant: {
      id:            tenant.id,
      name:          tenant.name,
      slug:          tenant.slug,
      subdomain:     tenant.subdomain,
      custom_domain: tenant.custom_domain,
    },
    settings,
    isPublished: settings?.is_published ?? false,
  }
}

async function fetchTenant(
  db: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<TenantRow | null> {
  const { data } = await db
    .from('tenants')
    .select('id, name, slug, subdomain, custom_domain, status')
    .eq('id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  return (data as TenantRow | null)
}

async function fetchSiteSettings(
  db: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<SiteSettings | null> {
  const { data } = await db
    .from('site_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return (data as unknown as SiteSettings | null)
}

function normalizeHost(host: string): string {
  return host.split(':')[0].toLowerCase()
}

function extractSubdomain(hostname: string, rootDomain: string): string | null {
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace(/\.localhost$/, '')
    return sub || null
  }

  const suffix = `.${rootDomain}`
  if (hostname.endsWith(suffix)) {
    const sub = hostname.slice(0, hostname.length - suffix.length)
    return sub || null
  }

  return null
}
