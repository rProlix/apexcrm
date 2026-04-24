// lib/website/resolveWebsiteTenant.ts
//
// Shared server-side helper for all /website dashboard pages.
// Returns the resolved tenant_id string or null.
//
// Resolution order (mirrors DashboardLayout exactly):
//  1. getUserContext().tenant_id          (users table — fastest, most common)
//  2. Host header → getTenantFromHost     (custom domain / subdomain routing)
//  3. Auth user → users table direct      (stale ctx edge case)
//  4. Dev-only: first active tenant       (matches DashboardLayout dev fallback)

import { headers } from 'next/headers'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

export async function resolveWebsiteTenantId(): Promise<string | null> {
  // 1. Try user context first — cheapest path
  const ctx = await getUserContext()
  if (ctx?.tenant_id) return ctx.tenant_id

  // 2. Host-based resolution (mirrors DashboardLayout)
  const host   = headers().get('host') ?? ''
  const tenant = await getTenantFromHost(host)
  if (tenant?.id) return tenant.id

  // 3. Direct auth-user → users table lookup
  try {
    const sessionClient = createSessionServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()

    if (user?.id) {
      const admin = getSupabaseServerClient()

      const { data: record } = await admin
        .from('users')
        .select('tenant_id')
        .eq('auth_user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (record?.tenant_id) return record.tenant_id

      // 4. Dev-only: use first active tenant — same behaviour as DashboardLayout.
      //    Also persists the link so this fallback only runs once.
      if (process.env.NODE_ENV === 'development') {
        const { data: firstTenant } = await admin
          .from('tenants')
          .select('id')
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        if (firstTenant?.id) {
          // Persist so every subsequent request finds the tenant via step 1/3
          await admin.from('users').upsert(
            {
              auth_user_id: user.id,
              tenant_id:    firstTenant.id,
              email:        user.email ?? '',
              role:         'admin',
              status:       'active',
            },
            { onConflict: 'auth_user_id' }
          )
          return firstTenant.id
        }
      }
    }
  } catch {
    // Non-fatal — fall through to null
  }

  return null
}

/**
 * Sanitizes a tenant_id value coming from a request body or query param.
 * Treats empty strings as null so the caller can safely do `if (!tid)`.
 */
export function sanitizeTenantId(value: unknown): string | null {
  if (!value || typeof value !== 'string' || !value.trim()) return null
  return value.trim()
}
