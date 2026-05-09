// lib/auth/types.ts

export type PlatformRole = 'owner'
export type TenantRole   = 'admin' | 'manager' | 'staff'
export type CustomerRole = 'customer'
export type AnyRole      = PlatformRole | TenantRole | CustomerRole

/**
 * Context for an authenticated platform or tenant user (users table).
 * - owner:  tenant_id is null; has global control
 * - admin:  tenant admin; full access to their own CRM
 * - staff:  limited access within a tenant
 */
export type UserContext = {
  id:        string
  auth_id:   string
  tenant_id: string | null
  role:      PlatformRole | TenantRole
  email:     string
}

/**
 * Context for an authenticated customer portal user (customer_accounts table).
 */
export type CustomerContext = {
  id:          string           // customer_accounts.id
  auth_id:     string           // auth.users.id
  tenant_id:   string
  customer_id: string           // customers.id
  role:        CustomerRole
  email:       string
}
