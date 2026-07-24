import { redirect } from 'next/navigation'
import { getUserContext } from './getUserContext'
import type { UserContext } from './types'

export type PlatformOwnerAccess =
  | { ok: true; context: UserContext }
  | {
      ok: false
      status: 401 | 403
      error: 'Unauthorized' | 'Forbidden'
      context: UserContext | null
    }

export function isPlatformOwner(context: { role: string } | null | undefined) {
  return context?.role === 'owner'
}

/**
 * Canonical server-component/server-action guard for platform infrastructure.
 * Tenant admin privileges never satisfy this check.
 */
export async function requirePlatformOwner(): Promise<UserContext> {
  const context = await getUserContext()
  if (!context) redirect('/login')
  if (!isPlatformOwner(context)) {
    const { auditInfrastructureAction } = await import('@/lib/server/infrastructure/status')
    await auditInfrastructureAction(context.id, 'infrastructure_configuration.access_rejected', {
      surface: 'owner_route',
    })
    redirect('/dashboard?error=forbidden')
  }
  return context
}

/**
 * Canonical API authorization result. Callers can return a safe 401/403 without
 * leaking whether any infrastructure integration is configured.
 */
export async function resolvePlatformOwnerAccess(): Promise<PlatformOwnerAccess> {
  const context = await getUserContext()
  if (!context) return { ok: false, status: 401, error: 'Unauthorized', context: null }
  if (!isPlatformOwner(context)) {
    return { ok: false, status: 403, error: 'Forbidden', context }
  }
  return { ok: true, context }
}
