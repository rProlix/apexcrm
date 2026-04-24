// lib/auth/resolveStoreUser.ts
import type { NextRequest } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'

export interface StoreUser {
  id:        string
  auth_id:   string
  tenant_id: string        // always resolved — never null here
  role:      string
}

/**
 * Resolves the authenticated dashboard user (owner / admin) plus their
 * tenant_id for store API routes.
 *
 * Resolution order for tenant_id:
 *  1. users.tenant_id from the database (fast path)
 *  2. Host header → getTenantFromHost (fallback when users.tenant_id is null)
 *  3. Dev-only: first active tenant (prevents hard failures on localhost)
 *
 * Returns null when:
 *  - no active session
 *  - no matching users row
 *  - tenant cannot be resolved by any method
 */
export async function resolveStoreUser(req: NextRequest): Promise<StoreUser | null> {
  const session = createSessionServerClient()
  const { data: { user }, error } = await session.auth.getUser()
  if (error || !user) return null

  const admin = getSupabaseServerClient()
  const { data: record } = await admin
    .from('users')
    .select('id, tenant_id, role')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!record) return null

  // Fast path: tenant_id already stored on the user record
  if (record.tenant_id) {
    return {
      id:        record.id,
      auth_id:   user.id,
      tenant_id: record.tenant_id,
      role:      record.role,
    }
  }

  // Fallback 1: resolve from the request Host header
  const host   = req.headers.get('host') ?? ''
  const tenant = await getTenantFromHost(host)
  if (tenant) {
    return {
      id:        record.id,
      auth_id:   user.id,
      tenant_id: tenant.id,
      role:      record.role,
    }
  }

  // Fallback 2 (dev only): use the first active tenant so localhost works
  if (process.env.NODE_ENV === 'development') {
    const { data: devTenant } = await admin
      .from('tenants')
      .select('id')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()

    if (devTenant) {
      return {
        id:        record.id,
        auth_id:   user.id,
        tenant_id: devTenant.id,
        role:      record.role,
      }
    }
  }

  return null
}

/**
 * Resolves the authenticated customer portal user for store API routes.
 * Returns null if no active session or no matching customer_account.
 */
export async function resolveStoreCustomer(req: NextRequest) {
  const session = createSessionServerClient()
  const { data: { user }, error } = await session.auth.getUser()
  if (error || !user) return null

  const admin = getSupabaseServerClient()

  // Try to scope to a specific tenant via host
  const host   = req.headers.get('host') ?? ''
  const tenant = await getTenantFromHost(host)

  const query = admin
    .from('customer_accounts')
    .select('id, customer_id, tenant_id, status')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')

  // Scope to the request tenant if we could resolve one
  if (tenant) query.eq('tenant_id', tenant.id)

  const { data: account } = await query.maybeSingle()
  if (!account) return null

  return {
    id:          account.id,
    auth_id:     user.id,
    customer_id: account.customer_id,
    tenant_id:   account.tenant_id,
    role:        'customer' as const,
  }
}
