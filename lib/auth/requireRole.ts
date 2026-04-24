// lib/auth/requireRole.ts
import { redirect } from 'next/navigation'
import { getUserContext } from './getUserContext'
import type { AnyRole, UserContext } from './types'

/**
 * Server-side role guard.
 *
 * Fetches the current user context and throws a Next.js redirect if the user
 * is unauthenticated or does not hold one of the allowed roles.
 *
 * Usage (server component or server action):
 *   const ctx = await requireRole(['owner', 'admin'])
 */
export async function requireRole(allowedRoles: AnyRole[]): Promise<UserContext> {
  const ctx = await getUserContext()

  if (!ctx) {
    redirect('/login')
  }

  if (!allowedRoles.includes(ctx.role as AnyRole)) {
    redirect('/dashboard?error=forbidden')
  }

  return ctx
}

/**
 * Require the platform owner role specifically.
 * Shorthand for requireRole(['owner']).
 */
export async function requireOwner(): Promise<UserContext> {
  return requireRole(['owner'])
}

/**
 * Require a tenant-level role (admin or staff).
 * Does NOT allow the platform owner — use requireRole(['owner','admin','staff'])
 * if you want to include the owner.
 */
export async function requireTenantRole(): Promise<UserContext> {
  return requireRole(['admin', 'staff'])
}
