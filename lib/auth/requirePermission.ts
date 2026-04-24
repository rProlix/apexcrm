// lib/auth/requirePermission.ts
import { redirect } from 'next/navigation'
import { getUserContext } from './getUserContext'
import { hasPermission } from './permissions'
import type { UserContext } from './types'

/**
 * Server-side permission guard.
 *
 * Fetches the current user context and throws a Next.js redirect if the user
 * is unauthenticated or lacks the required permission.
 *
 * Usage (server component or server action):
 *   const ctx = await requirePermission('manage_staff')
 */
export async function requirePermission(permission: string): Promise<UserContext> {
  const ctx = await getUserContext()

  if (!ctx) {
    redirect('/login')
  }

  if (!hasPermission(ctx.role, permission)) {
    redirect('/dashboard?error=forbidden')
  }

  return ctx
}

/**
 * Require that the user holds at least one of the given permissions (OR gate).
 */
export async function requireAnyPermission(permissions: string[]): Promise<UserContext> {
  const ctx = await getUserContext()

  if (!ctx) {
    redirect('/login')
  }

  const granted = permissions.some((p) => hasPermission(ctx.role, p))
  if (!granted) {
    redirect('/dashboard?error=forbidden')
  }

  return ctx
}
