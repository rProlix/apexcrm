// lib/product-360/auth.ts
// Auth helpers for the product_360 module. SERVER-ONLY.

import type { NextRequest }       from 'next/server'
import { resolveStoreUser }       from '@/lib/auth/resolveStoreUser'
import { getUserContext }          from '@/lib/auth/getUserContext'
import type { UserContext }        from '@/lib/auth/types'

export interface P360ApiUser {
  userId:   string
  role:     string
  tenantId: string
  isOwner:  boolean
}

/**
 * Resolves auth from a NextRequest.
 * Returns null if unauthenticated.
 */
export async function resolveP360ApiUser(req: NextRequest): Promise<P360ApiUser | null> {
  const user = await resolveStoreUser(req)
  if (!user) return null
  return {
    userId:   user.id,
    role:     user.role,
    tenantId: user.tenant_id,
    isOwner:  user.role === 'owner',
  }
}

/**
 * Resolves the effective tenantId for a 360 request.
 * - Owner: may specify ?tenantId= or use their own
 * - Admin/staff: always their own tenant (ignores any provided tenantId)
 */
export function resolveTenantId(
  user: { role: string; tenantId: string },
  requestedTenantId?: string | null,
): string | null {
  if (!user.tenantId) return null
  if (user.role === 'owner') {
    return requestedTenantId?.trim() || user.tenantId
  }
  return user.tenantId
}

/**
 * Returns the user context for server components.
 * Redirects to /login or /dashboard?error=forbidden if not admin/owner.
 */
export async function requireP360ManagerAccess(
  tenantId?: string,
): Promise<UserContext> {
  const { redirect } = await import('next/navigation')
  const ctx          = await getUserContext()

  if (!ctx) redirect('/login')
  if (!ctx) throw new Error('unreachable')

  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    redirect('/dashboard?error=forbidden')
  }

  if (tenantId && ctx.role === 'admin' && ctx.tenant_id !== tenantId) {
    redirect('/dashboard?error=forbidden')
  }

  return ctx
}
