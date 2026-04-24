// app/api/staff/[id]/route.ts
// PATCH  — update staff role (owner rows are immutable; owner role is unassignable)
// DELETE — remove a staff member (owner rows are permanently protected)
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { canManageStaff } from '@/lib/staff/canManageStaff'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['admin', 'staff'] as const

interface RouteContext {
  params: Promise<{ id: string }>
}

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

/**
 * Resolve the calling user and fetch the target staff member.
 * Returns an error response if any guard fails.
 *
 * Guarantees that the target:
 *  - exists in the caller's tenant
 *  - is NOT an owner (never expose or modify owner rows)
 */
async function resolveTarget(targetId: string) {
  const ctx = await getUserContext()

  if (!ctx)                                   return { ok: false as const, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!['owner', 'admin'].includes(ctx.role)) return { ok: false as const, res: forbidden() }

  const tenantId = ctx.tenant_id
  if (!tenantId) return { ok: false as const, res: NextResponse.json({ error: 'No tenant context' }, { status: 400 }) }

  // Self-action guard
  if (targetId === ctx.id) {
    return { ok: false as const, res: NextResponse.json({ error: 'Cannot modify your own account here' }, { status: 400 }) }
  }

  const db = getSupabaseServerClient()

  // Fetch target — must be in this tenant AND must NOT be an owner
  const { data: target } = await db
    .from('users')
    .select('id, role, tenant_id, metadata')
    .eq('id', targetId)
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')                           // CRITICAL: block targeting owner rows
    .maybeSingle()

  // Return 404 for both "not found" and "is owner" — never reveal existence of owner rows
  if (!target) {
    return { ok: false as const, res: NextResponse.json({ error: 'Staff member not found' }, { status: 404 }) }
  }

  return { ok: true as const, ctx, tenantId, target }
}

/**
 * PATCH /api/staff/[id]
 *
 * Body: { role: 'admin' | 'staff' }
 *
 * Updates the role of a staff member. Owner role cannot be assigned.
 *
 * Access: admin (own tenant), owner (any tenant member of their tenant)
 */
export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const resolved = await resolveTarget((await params).id)
  if (!resolved.ok) return resolved.res

  const { ctx, tenantId, target } = resolved

  // Permission check: can this caller manage this target?
  if (!canManageStaff(ctx, target as Parameters<typeof canManageStaff>[1])) {
    return forbidden('You do not have permission to modify this staff member')
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { role } = body

  if (!role || !ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json(
      { error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  const db = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('users') as any)
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', (await params).id)
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')                           // safety net: never update owner rows

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/staff/[id]
 *
 * Removes a staff member from the tenant.
 * Owner rows are fully protected; a 404 is returned instead of 403 to
 * avoid leaking information about the owner's account.
 *
 * Access: admin (own tenant, own invites), owner (full access in their tenant)
 */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const resolved = await resolveTarget((await params).id)
  if (!resolved.ok) return resolved.res

  const { ctx, tenantId, target } = resolved

  // Permission check
  if (!canManageStaff(ctx, target as Parameters<typeof canManageStaff>[1])) {
    return forbidden('You do not have permission to remove this staff member')
  }

  const db = getSupabaseServerClient()

  const { error } = await db
    .from('users')
    .delete()
    .eq('id', (await params).id)
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')                           // final safety net on DELETE

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
