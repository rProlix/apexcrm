// lib/auth/resolveSiteUser.ts
//
// Unified auth resolver for tenant storefronts.
//
// Supabase Auth is the single identity source. One auth user can be:
//   - A business user (owner/admin/staff) identified via the `users` table
//   - A customer identified via the `customer_accounts` table
//
// Business users do NOT need a customer_accounts row to access their own site.

import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

export type SiteUserContext = {
  authUserId:     string
  email:          string | null
  role:           'owner' | 'admin' | 'staff' | 'customer'
  tenantId:       string | null
  accessLevel:    'platform' | 'business' | 'customer'
  canEditWebsite: boolean
  canManageStore: boolean
  customerId:     string | null
}

/**
 * Resolves the authenticated user's context for a specific tenant storefront.
 *
 * Resolution order:
 *  1. Check the `users` table for a business identity (owner / admin / staff).
 *     Owners can access any tenant. Admin/staff are scoped to their own tenant.
 *  2. If no business identity, check `customer_accounts` for this tenant.
 *
 * Returns null when:
 *  - No active session
 *  - Authenticated but not associated with this tenant in any role
 *
 * The caller decides what to do with a non-null context whose
 * canEditWebsite / canManageStore are false (e.g. wrong-tenant admin).
 */
export async function resolveSiteUser(tenantId: string): Promise<SiteUserContext | null> {
  const sessionClient = await createSessionServerClient()
  const { data: { user }, error } = await sessionClient.auth.getUser()
  if (error || !user) return null

  const admin = getSupabaseServerClient()

  // ── 1. Business identity check ──────────────────────────────────────────
  const { data: userRecord } = await admin
    .from('users')
    .select('id, tenant_id, role, email')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (userRecord) {
    const role = userRecord.role as 'owner' | 'admin' | 'staff'

    if (role === 'owner') {
      return {
        authUserId:     user.id,
        email:          userRecord.email ?? user.email ?? null,
        role:           'owner',
        tenantId:       userRecord.tenant_id ?? null,
        accessLevel:    'platform',
        canEditWebsite: true,
        canManageStore: true,
        customerId:     null,
      }
    }

    if (role === 'admin' || role === 'staff') {
      const belongsToTenant = userRecord.tenant_id === tenantId
      return {
        authUserId:     user.id,
        email:          userRecord.email ?? user.email ?? null,
        role,
        tenantId:       userRecord.tenant_id ?? null,
        accessLevel:    'business',
        canEditWebsite: belongsToTenant,
        canManageStore: belongsToTenant,
        customerId:     null,
      }
    }
  }

  // ── 2. Customer identity check ───────────────────────────────────────────
  const { data: account } = await admin
    .from('customer_accounts')
    .select('id, customer_id, tenant_id, status')
    .eq('auth_user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (account && account.status === 'active') {
    return {
      authUserId:     user.id,
      email:          user.email ?? null,
      role:           'customer',
      tenantId:       account.tenant_id,
      accessLevel:    'customer',
      canEditWebsite: false,
      canManageStore: false,
      customerId:     account.customer_id,
    }
  }

  return null
}

/**
 * Convenience: returns true if the resolved context belongs to a business user
 * (owner, admin, or staff) — regardless of whether they match this specific tenant.
 */
export function isBusinessUser(ctx: SiteUserContext | null): boolean {
  return ctx?.accessLevel === 'platform' || ctx?.accessLevel === 'business'
}

/**
 * Convenience: returns true if the context has full management rights for the tenant.
 */
export function canManageTenant(ctx: SiteUserContext | null): boolean {
  return ctx?.canEditWebsite === true && ctx?.canManageStore === true
}
