// lib/website/getSiteByHost.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { SiteByHostResult, SiteSettings } from './types'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

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
  let db: ReturnType<typeof getSupabaseServerClient>
  try {
    db = getSupabaseServerClient()
  } catch (err) {
    console.error('[getSiteByHost] Supabase client init failed:', err instanceof Error ? err.message : err)
    return null
  }

  const hostname = normalizeHost(host)

  try {
    // 1. Exact custom domain stored in site_settings
    {
      const { data, error } = await db
        .from('site_settings')
        .select('*')
        .eq('custom_domain', hostname)
        .maybeSingle()

      if (error) console.error('[getSiteByHost] site_settings custom_domain lookup:', error.message)
      else if (data) {
        const tenant = await fetchTenant(db, data.tenant_id)
        if (tenant) return buildResult(tenant, data as unknown as SiteSettings)
      }
    }

    // 2. Verified custom domain in tenant_domains
    {
      const { data: domainRow, error } = await db
        .from('tenant_domains')
        .select('tenant_id, verified')
        .eq('hostname', hostname)
        .eq('verified', true)
        .maybeSingle()

      if (error) console.error('[getSiteByHost] tenant_domains lookup:', error.message)
      else if (domainRow?.tenant_id) {
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
        const { data: tenant, error } = await db
          .from('tenants')
          .select('id, name, slug, subdomain, custom_domain, status')
          .eq('subdomain', subdomain)
          .eq('status', 'active')
          .maybeSingle()

        if (error) console.error('[getSiteByHost] tenants.subdomain lookup:', error.message)
        else if (tenant) {
          const settings = await fetchSiteSettings(db, tenant.id)
          return buildResult(tenant as TenantRow, settings)
        }
      }

      // 4. Match site_settings.subdomain (builder-assigned)
      {
        const { data, error } = await db
          .from('site_settings')
          .select('*')
          .eq('subdomain', subdomain)
          .maybeSingle()

        if (error) console.error('[getSiteByHost] site_settings.subdomain lookup:', error.message)
        else if (data) {
          const tenant = await fetchTenant(db, data.tenant_id)
          if (tenant) return buildResult(tenant, data as unknown as SiteSettings)
        }
      }
    }
  } catch (err) {
    console.error('[getSiteByHost] unexpected error for host', host, ':', err instanceof Error ? err.message : err)
  }

  return null
}

/**
 * Resolves the tenant and site_settings by tenant slug directly.
 * Faster than getSiteByHost when the slug is already known (e.g., from middleware).
 */
export async function getSiteBySlug(slug: string): Promise<SiteByHostResult | null> {
  let db: ReturnType<typeof getSupabaseServerClient>
  try {
    db = getSupabaseServerClient()
  } catch (err) {
    console.error('[getSiteBySlug] Supabase client init failed:', err instanceof Error ? err.message : err)
    return null
  }

  try {
    const { data: tenant, error } = await db
      .from('tenants')
      .select('id, name, slug, subdomain, custom_domain, status')
      .eq('slug', slug)
      .eq('status', 'active')
      .maybeSingle()

    if (error) {
      console.error('[getSiteBySlug] tenant lookup error for slug', slug, ':', error.message)
      return null
    }

    if (!tenant) return null

    const settings = await fetchSiteSettings(db, tenant.id)
    return buildResult(tenant as TenantRow, settings)
  } catch (err) {
    console.error('[getSiteBySlug] unexpected error for slug', slug, ':', err instanceof Error ? err.message : err)
    return null
  }
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
  try {
    const { data, error } = await db
      .from('tenants')
      .select('id, name, slug, subdomain, custom_domain, status')
      .eq('id', tenantId)
      .eq('status', 'active')
      .maybeSingle()
    if (error) console.error('[fetchTenant] error for id', tenantId, ':', error.message)
    return (data as TenantRow | null)
  } catch (err) {
    console.error('[fetchTenant] unexpected error:', err instanceof Error ? err.message : err)
    return null
  }
}

async function fetchSiteSettings(
  db: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<SiteSettings | null> {
  try {
    const { data, error } = await db
      .from('site_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle()
    if (error) console.error('[fetchSiteSettings] error for tenant', tenantId, ':', error.message)
    return (data as unknown as SiteSettings | null)
  } catch (err) {
    console.error('[fetchSiteSettings] unexpected error:', err instanceof Error ? err.message : err)
    return null
  }
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
