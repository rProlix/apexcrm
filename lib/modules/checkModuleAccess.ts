// lib/modules/checkModuleAccess.ts
import { NextResponse } from 'next/server'
import { isModuleEnabled } from '@/lib/modules/isModuleEnabled'

/**
 * API route guard: returns a 403 NextResponse when the requested module is
 * disabled for the tenant, or null when access is allowed.
 *
 * Usage in any route handler:
 *
 *   const blocked = await checkModuleAccess(tenantId, 'payments', user.role)
 *   if (blocked) return blocked
 *
 * The platform owner bypasses all module checks.
 * If tenantId is null/undefined and the caller is not an owner, a 400 is returned.
 *
 * @param tenantId  - Resolved tenant UUID (null for owner cross-tenant operations)
 * @param moduleKey - Module key to verify (e.g. 'payments', 'rewards')
 * @param userRole  - Caller's role string — owner bypasses the check
 */
export async function checkModuleAccess(
  tenantId:  string | null | undefined,
  moduleKey: string,
  userRole?: string,
): Promise<NextResponse | null> {
  if (userRole === 'owner') return null

  if (!tenantId) {
    return NextResponse.json(
      { error: 'Tenant context required' },
      { status: 400 }
    )
  }

  const enabled = await isModuleEnabled(tenantId, moduleKey)

  if (!enabled) {
    return NextResponse.json(
      { error: `Module '${moduleKey}' is not enabled for this tenant` },
      { status: 403 }
    )
  }

  return null
}
