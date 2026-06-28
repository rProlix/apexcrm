// lib/pov/admin.ts
// SERVER-ONLY authorization helpers for POV admin/builder routes.

import 'server-only'
import { getUserContext } from '@/lib/auth/getUserContext'
import { resolveEvent } from '@/lib/pov/events'
import type { UserContext } from '@/lib/auth/types'
import type { PovEventRow } from '@/lib/pov/types'

export interface AdminEventAuth {
  ctx:   UserContext
  event: PovEventRow
}

/** True for owner, or admin/staff of the event's tenant. */
export function canManageEvent(ctx: UserContext, event: Pick<PovEventRow, 'tenant_id'>): boolean {
  if (ctx.role === 'owner') return true
  return ['admin', 'staff'].includes(ctx.role) && ctx.tenant_id === event.tenant_id
}

/**
 * Resolves the authenticated admin/owner and the target event, verifying the
 * caller may manage it. Returns a discriminated result.
 */
export async function authorizeEventAdmin(idOrSlug: string): Promise<
  | { ok: true; ctx: UserContext; event: PovEventRow }
  | { ok: false; status: number; error: string }
> {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin', 'staff'].includes(ctx.role)) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }
  const event = await resolveEvent(idOrSlug)
  if (!event) return { ok: false, status: 404, error: 'Event not found' }
  if (!canManageEvent(ctx, event)) return { ok: false, status: 403, error: 'Forbidden' }
  return { ok: true, ctx, event }
}
