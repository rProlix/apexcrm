// lib/modules/guardModuleAccess.ts
import { redirect } from 'next/navigation'
import { loadTenantConfig } from '@/lib/tenant/loadTenantConfig'
import { hasPermission } from '@/lib/auth/permissions'
import type { AnyRole } from '@/lib/auth/types'

/**
 * Server-side guard that redirects to /dashboard if:
 *  - The tenant config cannot be loaded
 *  - The requested module is not enabled for this tenant
 *  - The user does not have the 'use_modules' permission (when userRole is provided)
 *
 * Platform owners bypass all module checks.
 *
 * @param tenantId  - The resolved tenant UUID
 * @param moduleKey - The module key to check (e.g. 'vehicles', 'appointments')
 * @param userRole  - Optional: the calling user's role for permission enforcement
 */
export async function guardModuleAccess(
  tenantId:  string,
  moduleKey: string,
  userRole?: string
): Promise<void> {
  // Platform owner has unrestricted access to all modules
  if (userRole === 'owner') return

  // Check user permission before loading config (fast fail)
  if (userRole && !hasPermission(userRole as AnyRole, 'use_modules')) {
    redirect('/dashboard?error=forbidden')
  }

  const config = await loadTenantConfig(tenantId)

  if (!config) {
    redirect('/login')
  }

  if (!config.enabledModuleKeys.includes(moduleKey)) {
    redirect('/dashboard?error=module_disabled')
  }
}

/**
 * Returns true if the module is enabled for the tenant, without redirecting.
 * Also returns true for the platform owner regardless of module state.
 *
 * Useful for conditional rendering decisions in layouts.
 */
export async function isModuleEnabled(
  tenantId:  string,
  moduleKey: string,
  userRole?: string
): Promise<boolean> {
  if (userRole === 'owner') return true
  const config = await loadTenantConfig(tenantId)
  return config?.enabledModuleKeys.includes(moduleKey) ?? false
}

/**
 * Returns true when the user has both the module permission and
 * the module is enabled for the tenant.
 */
export async function canAccessModule(
  tenantId:  string,
  moduleKey: string,
  userRole:  string
): Promise<boolean> {
  if (userRole === 'owner') return true
  if (!hasPermission(userRole as AnyRole, 'use_modules')) return false
  const config = await loadTenantConfig(tenantId)
  return config?.enabledModuleKeys.includes(moduleKey) ?? false
}
