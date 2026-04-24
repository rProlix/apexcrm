// lib/owner/getTenants.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface TenantSummary {
  id:              string
  name:            string
  slug:            string
  subdomain:       string | null
  custom_domain:   string | null
  status:          string
  created_at:      string
  branding:        Record<string, unknown>
  enabled_modules: number   // count of enabled modules
  staff_count:     number   // count of active staff users
}

/**
 * Returns all tenants ordered by creation date (newest first), with
 * lightweight aggregated stats: enabled module count and staff count.
 *
 * Server-only — uses service role client (bypasses RLS).
 * Always call from owner-verified contexts.
 */
export async function getTenants(): Promise<TenantSummary[]> {
  const admin = getSupabaseServerClient()

  const [
    { data: tenants, error },
    { data: moduleCounts },
    { data: userCounts },
  ] = await Promise.all([
    admin
      .from('tenants')
      .select('id, name, slug, subdomain, custom_domain, status, created_at, branding')
      .order('created_at', { ascending: false }),
    admin
      .from('tenant_modules')
      .select('tenant_id, enabled'),
    admin
      .from('users')
      .select('tenant_id')
      .not('tenant_id', 'is', null)
      .eq('status', 'active'),
  ])

  if (error) {
    console.error('[getTenants] error:', error.message)
    return []
  }

  const enabledMap: Record<string, number> = {}
  for (const m of moduleCounts ?? []) {
    if (m.enabled && m.tenant_id) {
      enabledMap[m.tenant_id] = (enabledMap[m.tenant_id] ?? 0) + 1
    }
  }

  const staffMap: Record<string, number> = {}
  for (const u of userCounts ?? []) {
    if (u.tenant_id) {
      staffMap[u.tenant_id] = (staffMap[u.tenant_id] ?? 0) + 1
    }
  }

  return (tenants ?? []).map((t) => ({
    id:              t.id,
    name:            t.name,
    slug:            t.slug,
    subdomain:       t.subdomain,
    custom_domain:   t.custom_domain,
    status:          t.status,
    created_at:      t.created_at,
    branding:        (t.branding as Record<string, unknown>) ?? {},
    enabled_modules: enabledMap[t.id] ?? 0,
    staff_count:     staffMap[t.id]   ?? 0,
  }))
}

/**
 * Returns a single tenant by UUID, or null if not found.
 */
export async function getTenantById(id: string): Promise<TenantSummary | null> {
  const admin = getSupabaseServerClient()

  const [
    { data: tenant, error },
    { data: moduleCounts },
    { data: userCounts },
  ] = await Promise.all([
    admin
      .from('tenants')
      .select('id, name, slug, subdomain, custom_domain, status, created_at, branding')
      .eq('id', id)
      .maybeSingle(),
    admin
      .from('tenant_modules')
      .select('enabled')
      .eq('tenant_id', id),
    admin
      .from('users')
      .select('id')
      .eq('tenant_id', id)
      .eq('status', 'active'),
  ])

  if (error || !tenant) return null

  const enabledModules = (moduleCounts ?? []).filter((m) => m.enabled).length

  return {
    id:              tenant.id,
    name:            tenant.name,
    slug:            tenant.slug,
    subdomain:       tenant.subdomain,
    custom_domain:   tenant.custom_domain,
    status:          tenant.status,
    created_at:      tenant.created_at,
    branding:        (tenant.branding as Record<string, unknown>) ?? {},
    enabled_modules: enabledModules,
    staff_count:     userCounts?.length ?? 0,
  }
}
