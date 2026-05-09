// lib/auth/permissions.ts
import type { AnyRole } from './types'

/**
 * Static permission map.
 * - owner:    wildcard ('*') — every permission check returns true
 * - admin:    full tenant management
 * - staff:    read + use modules, no administrative actions
 * - customer: self-service portal only
 */
const PERMISSION_MAP: Record<string, string[]> = {
  owner: ['*'],
  admin: [
    'view_dashboard',
    'manage_staff',
    'view_modules',
    'use_modules',
    'view_customers',
    'manage_customers',
    'view_reports',
  ],
  manager: [
    'view_dashboard',
    'use_modules',
    'view_customers',
    'manage_customers',
    'view_reports',
  ],
  staff: [
    'view_dashboard',
    'use_modules',
    'view_customers',
  ],
  customer: [
    'view_own_data',
    'create_orders',
    'view_rewards',
  ],
}

/**
 * Returns true when `role` holds the given permission.
 * The owner role always returns true regardless of the permission key.
 */
export function hasPermission(role: AnyRole, permission: string): boolean {
  if (role === 'owner') return true
  return (PERMISSION_MAP[role] ?? []).includes(permission)
}

/**
 * Returns the full list of permissions for a role.
 * Returns ['*'] for owner.
 */
export function getPermissions(role: AnyRole): string[] {
  return PERMISSION_MAP[role] ?? []
}

/**
 * Returns true when `role` is authorised to access any of the supplied
 * permissions (logical OR). Useful for multi-permission gates.
 */
export function hasAnyPermission(role: AnyRole, permissions: string[]): boolean {
  return permissions.some((p) => hasPermission(role, p))
}

/**
 * Returns true when `role` holds all of the supplied permissions (logical AND).
 */
export function hasAllPermissions(role: AnyRole, permissions: string[]): boolean {
  return permissions.every((p) => hasPermission(role, p))
}
