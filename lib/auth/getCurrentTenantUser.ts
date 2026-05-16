// lib/auth/getCurrentTenantUser.ts
//
// Unified auth resolver for tenant context.
//
// This is the single source of truth for "who is this user relative to tenant X?"
// It handles the full spectrum of identities:
//   - Platform owner  (Nexora admin — can access everything)
//   - Business admin  (owner/admin/staff of this specific tenant)
//   - Customer        (registered customer at this tenant)
//   - Both            (a business user who also has a customer account here)
//   - Unauthenticated (no valid session)
//
// Use this in every server component, route handler, or server action that
// needs to know who the user is relative to a tenant.
//
// NOTE: This does NOT replace getUserContext() for CRM routes.
//       Use getUserContext() for CRM-only pages (dashboard, settings, etc.)
//       Use this file for business website pages and customer portal pages.

import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────────────

export type TenantUserRole = 'owner' | 'admin' | 'staff' | 'employee' | 'customer' | 'guest'

export type TenantUserContext = {
  /** Supabase Auth user — null when unauthenticated */
  user: User | null
  /** The resolved tenant UUID */
  tenantId: string
  /** Tenant slug (subdomain) if known */
  tenantSlug: string | null
  /** True when there is a valid Supabase Auth session */
  isAuthenticated: boolean
  /** True when user has an active customer_accounts row for this tenant */
  isCustomer: boolean
  /** True when user has a business role (owner/admin/staff) */
  isBusinessUser: boolean
  /**
   * Effective role — in priority order:
   *   owner > admin > staff > customer > guest
   * A platform owner visiting a tenant is still 'owner'.
   * An admin/staff for this tenant is 'admin' or 'staff'.
   * A user who is both business user and customer is the business role.
   */
  role: TenantUserRole
  /** customer_accounts.id if this user is a customer of this tenant */
  customerAccountId: string | null
  /** customers.id if this user is a customer of this tenant */
  customerId: string | null
  /** users.id if this user is a business user */
  businessUserId: string | null
  /** User's email (from auth or DB) */
  email: string | null
  /** Whether this user can edit/manage the business website */
  canEditWebsite: boolean
  /** Whether this user can view the customer portal */
  canViewCustomerPortal: boolean
}

// ── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolves the current authenticated user's full context for a given tenant.
 *
 * @param tenantId - The tenant UUID to resolve against. Required.
 * @returns TenantUserContext — never throws; returns a guest context on error.
 */
export async function getCurrentTenantUser(tenantId: string): Promise<TenantUserContext> {
  const guest: TenantUserContext = {
    user:                  null,
    tenantId,
    tenantSlug:            null,
    isAuthenticated:       false,
    isCustomer:            false,
    isBusinessUser:        false,
    role:                  'guest',
    customerAccountId:     null,
    customerId:            null,
    businessUserId:        null,
    email:                 null,
    canEditWebsite:        false,
    canViewCustomerPortal: false,
  }

  if (!tenantId) return guest

  let user: User | null = null
  try {
    const session = await createSessionServerClient()
    const { data, error } = await session.auth.getUser()
    if (error || !data.user) return guest
    user = data.user
  } catch {
    return guest
  }

  const admin = getSupabaseServerClient()

  // ── 1. Check business identity (owner / admin / staff) ───────────────────
  const { data: businessRecord } = await admin
    .from('users')
    .select('id, tenant_id, role, email')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (businessRecord) {
    const role = businessRecord.role as TenantUserRole

    // Platform owner — unrestricted access to all tenants
    if (role === 'owner') {
      return {
        user,
        tenantId,
        tenantSlug:            null,
        isAuthenticated:       true,
        isCustomer:            false,
        isBusinessUser:        true,
        role:                  'owner',
        customerAccountId:     null,
        customerId:            null,
        businessUserId:        businessRecord.id,
        email:                 businessRecord.email ?? user.email ?? null,
        canEditWebsite:        true,
        canViewCustomerPortal: true,
      }
    }

    // Business admin or staff — scoped to their own tenant
    if (role === 'admin' || role === 'staff' || role === 'employee') {
      const belongsToTenant = businessRecord.tenant_id === tenantId
      return {
        user,
        tenantId,
        tenantSlug:            null,
        isAuthenticated:       true,
        isCustomer:            false,
        isBusinessUser:        true,
        role:                  belongsToTenant ? (role as TenantUserRole) : 'guest',
        customerAccountId:     null,
        customerId:            null,
        businessUserId:        businessRecord.id,
        email:                 businessRecord.email ?? user.email ?? null,
        canEditWebsite:        belongsToTenant && role !== 'employee',
        canViewCustomerPortal: false,
      }
    }
  }

  // ── 2. Check customer identity ────────────────────────────────────────────
  const { data: customerAccount } = await admin
    .from('customer_accounts')
    .select('id, customer_id, tenant_id, status')
    .eq('auth_user_id', user.id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (customerAccount && customerAccount.status !== 'inactive' && customerAccount.status !== 'suspended') {
    return {
      user,
      tenantId,
      tenantSlug:            null,
      isAuthenticated:       true,
      isCustomer:            true,
      isBusinessUser:        false,
      role:                  'customer',
      customerAccountId:     customerAccount.id,
      customerId:            customerAccount.customer_id,
      businessUserId:        null,
      email:                 user.email ?? null,
      canEditWebsite:        false,
      canViewCustomerPortal: true,
    }
  }

  // ── 3. Authenticated but no identity for this tenant ─────────────────────
  // Return an authenticated-but-unauthorised context.
  // The caller can decide how to handle this (e.g. show "ask for invite" message).
  return {
    user,
    tenantId,
    tenantSlug:            null,
    isAuthenticated:       true,
    isCustomer:            false,
    isBusinessUser:        false,
    role:                  'guest',
    customerAccountId:     null,
    customerId:            null,
    businessUserId:        null,
    email:                 user.email ?? null,
    canEditWebsite:        false,
    canViewCustomerPortal: false,
  }
}
