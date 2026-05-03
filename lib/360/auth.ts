// lib/360/auth.ts
// Authorization helpers for the product_360_spin module.
//
// Role rules:
//   owner  → can manage all tenants' packages
//   admin  → can manage only their own tenant's packages
//   staff  → read-only on their tenant's packages
//   customer / anon → can only read ready packages via public API
//
// These helpers use the app's existing auth system (getUserContext / resolveStoreUser).
// They never trust tenant_id from request bodies without verification.

import type { NextRequest }    from 'next/server'
import { getUserContext }       from '@/lib/auth/getUserContext'
import { resolveStoreUser }    from '@/lib/auth/resolveStoreUser'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { UserContext }    from '@/lib/auth/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Manager360Context {
  userId:    string
  role:      string
  tenantId:  string
  isOwner:   boolean
}

// ─── Server-component helpers (for dashboard pages) ──────────────────────────

/**
 * Returns the current user context, or null if unauthenticated.
 * Safe to call from Server Components.
 */
export async function getCurrentUserContext(): Promise<UserContext | null> {
  return getUserContext()
}

/**
 * Requires the user to be owner or admin.
 * Throws a redirect to /dashboard?error=forbidden if not.
 * Safe to call from Server Components.
 */
export async function require360ManagerAccess(tenantId?: string): Promise<UserContext> {
  const { redirect } = await import('next/navigation')
  const ctx          = await getUserContext()

  if (!ctx) redirect('/login')
  if (!ctx) throw new Error('unreachable')

  const allowed = ctx.role === 'owner' || ctx.role === 'admin'
  if (!allowed) redirect('/dashboard?error=forbidden')

  // If tenantId provided, admin must belong to that tenant
  if (tenantId && ctx.role === 'admin' && ctx.tenant_id !== tenantId) {
    redirect('/dashboard?error=forbidden')
  }

  return ctx
}

/**
 * Same as require360ManagerAccess but only allows owner OR the tenant's own admin.
 * Used for destructive operations (delete package, etc.)
 */
export async function require360OwnerOrTenantAdmin(tenantId: string): Promise<UserContext> {
  const ctx = await require360ManagerAccess(tenantId)
  return ctx
}

// ─── API route helpers (for route handlers) ──────────────────────────────────

/**
 * Resolves the authenticated dashboard user from a NextRequest.
 * Returns null if unauthenticated.
 */
export async function resolve360ApiUser(req: NextRequest) {
  return resolveStoreUser(req)
}

/**
 * Given a user and an optional tenantId from query/body:
 * - Owner can specify any tenantId, or defaults to their own
 * - Admin is always locked to their own tenantId; provided tenantId is ignored
 * - Returns null if the resolved tenantId is empty
 */
export function resolveTenantFor360Request(
  user: { role: string; tenant_id: string },
  requestedTenantId?: string | null,
): string | null {
  if (!user.tenant_id) return null

  if (user.role === 'owner') {
    return requestedTenantId?.trim() || user.tenant_id
  }

  // Admin / staff: always their own tenant, never trust request body
  return user.tenant_id
}

/**
 * Verifies that a specific package is readable by a public/anon caller
 * (status must be 'ready').  Used by the public storefront API.
 */
export async function canViewPublic360Package(
  tenantId:  string,
  packageId: string,
): Promise<boolean> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('product_360_packages')
    .select('id, status')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .eq('status', 'ready')
    .maybeSingle()

  return !!data
}
