/**
 * lib/getTenant.ts — Server-side tenant resolution utility.
 *
 * Reads the `x-tenant-slug` header injected by middleware and returns
 * the matching tenant record from the database.
 *
 * ONLY call this in Server Components, Server Actions, and Route Handlers.
 * Never import in client components.
 */

import { headers } from 'next/headers'
import { getSupabaseServerClient, createSessionServerClient } from '@/lib/supabase/server'
import type { TenantRecord } from '@/lib/tenant/getTenantFromHost'

/**
 * Resolves the current tenant from request headers.
 *
 * Resolution order:
 * 1. `x-tenant-slug` header (set by middleware from subdomain / custom domain)
 * 2. Authenticated user's own tenant (platform-host requests)
 * 3. First active tenant in dev mode (local fallback)
 * 4. Returns null if no tenant found
 */
export async function getTenant(): Promise<TenantRecord | null> {
  const headersList = await headers()
  const tenantSlug  = headersList.get('x-tenant-slug') ?? ''
  const admin       = getSupabaseServerClient()

  // ── 1. Slug from middleware header ────────────────────────────────────────
  if (tenantSlug) {
    const { data } = await admin
      .from('tenants')
      .select('*')
      .or(`slug.eq.${tenantSlug},subdomain.eq.${tenantSlug}`)
      .eq('status', 'active')
      .maybeSingle()

    if (data) return data as TenantRecord
  }

  // ── 2. Authenticated user's own tenant ───────────────────────────────────
  try {
    const sessionClient = await createSessionServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()

    if (user) {
      const { data: userRecord } = await admin
        .from('users')
        .select('tenant_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (userRecord?.tenant_id) {
        const { data } = await admin
          .from('tenants')
          .select('*')
          .eq('id', userRecord.tenant_id)
          .eq('status', 'active')
          .maybeSingle()

        if (data) return data as TenantRecord
      }
    }
  } catch {
    // Session unavailable (e.g. API route without cookies) — continue
  }

  // ── 3. Dev fallback ──────────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    const { data } = await admin
      .from('tenants')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (data) return data as TenantRecord
  }

  return null
}

/**
 * Same as getTenant() but throws if no tenant is found.
 * Use in pages/layouts that must have a tenant.
 */
export async function requireTenant(): Promise<TenantRecord> {
  const tenant = await getTenant()
  if (!tenant) {
    throw new Error('No tenant found for this request.')
  }
  return tenant
}
