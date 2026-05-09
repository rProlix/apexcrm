// app/api/owner/business-users/[id]/route.ts
// PATCH  — update role/status/approval for a business user
// DELETE — suspend/disable a business user (does not delete auth user)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ALL_BUSINESS_ROLES } from '@/lib/types/businessUsers'
import type { BusinessRole, BusinessUserStatus } from '@/lib/types/businessUsers'

const ALLOWED_STATUSES: BusinessUserStatus[] = ['active', 'suspended', 'disabled', 'pending']

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, error: message }, { status })
}

interface RouteContext { params: Promise<{ id: string }> }

// ─── PATCH /api/owner/business-users/[id] ────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const ctx = await getUserContext()
  if (!ctx)               return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (ctx.role !== 'owner') return err('FORBIDDEN', 'Only the platform owner can update business users.', 403)

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('INVALID_JSON', 'Request body must be valid JSON.', 400)
  }

  const supabase = getSupabaseServerClient()

  // Load target row — scoped to prevent cross-tenant actions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: target } = await (supabase as any)
    .from('users')
    .select('id, auth_user_id, role, status, tenant_id, approved')
    .eq('id', id)
    .maybeSingle()

  if (!target) return err('NOT_FOUND', 'Business user not found.', 404)

  const updates: Record<string, unknown> = {}

  if (typeof body.role === 'string') {
    const newRole = body.role as BusinessRole
    if (!ALL_BUSINESS_ROLES.includes(newRole)) {
      return err('INVALID_ROLE', `role must be one of: ${ALL_BUSINESS_ROLES.join(', ')}.`, 400)
    }
    // Prevent owner from accidentally revoking their own last owner
    if (target.role === 'owner' && newRole !== 'owner') {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', target.tenant_id)
        .eq('role', 'owner')
        .eq('status', 'active')

      if ((count ?? 0) <= 1) {
        return err('LAST_OWNER', 'Cannot change role of the only active owner for this tenant.', 409)
      }
    }
    updates.role = newRole
  }

  if (typeof body.status === 'string') {
    const newStatus = body.status as BusinessUserStatus
    if (!ALLOWED_STATUSES.includes(newStatus)) {
      return err('INVALID_STATUS', `status must be one of: ${ALLOWED_STATUSES.join(', ')}.`, 400)
    }
    // Prevent suspending the last active owner
    if (target.role === 'owner' && ['suspended', 'disabled'].includes(newStatus)) {
      const { count } = await supabase
        .from('users')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', target.tenant_id)
        .eq('role', 'owner')
        .eq('status', 'active')

      if ((count ?? 0) <= 1) {
        return err('LAST_OWNER', 'Cannot suspend or disable the only active owner for this tenant.', 409)
      }
    }
    updates.status = newStatus
  }

  if (typeof body.approved === 'boolean') {
    updates.approved = body.approved
  }

  if (typeof body.fullName === 'string') {
    updates.full_name = body.fullName.trim()
  }

  if (Object.keys(updates).length === 0) {
    return err('NO_CHANGES', 'No valid fields provided to update.', 400)
  }

  updates.updated_at = new Date().toISOString()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('users')
    .update(updates)
    .eq('id', id)

  if (updateError) {
    console.error('[PATCH /api/owner/business-users/[id]]', updateError.message)
    return err('SERVER_ERROR', 'Failed to update user.', 500)
  }

  // Sync app_metadata in Supabase Auth for role/status changes
  if (target.auth_user_id && (updates.role || updates.status || updates.approved !== undefined)) {
    const metaUpdates: Record<string, unknown> = {}
    if (updates.role)    metaUpdates.role     = updates.role
    if (updates.status)  metaUpdates.status   = updates.status
    if (updates.approved !== undefined) metaUpdates.approved = updates.approved

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).auth.admin.updateUserById(target.auth_user_id, {
        app_metadata:  metaUpdates,
        user_metadata: updates.role ? { role: updates.role } : undefined,
      })
    } catch (e) {
      console.error('[PATCH /api/owner/business-users/[id]] auth meta sync:', e)
      // Non-fatal — DB is source of truth for authorization
    }
  }

  return NextResponse.json({ ok: true, id, updated: updates })
}

// ─── DELETE /api/owner/business-users/[id] ───────────────────────────────────
// Suspends/disables rather than hard-deleting the auth user.

export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const { id } = await params
  const ctx = await getUserContext()
  if (!ctx)               return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (ctx.role !== 'owner') return err('FORBIDDEN', 'Only the platform owner can remove business users.', 403)

  const supabase = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: target } = await (supabase as any)
    .from('users')
    .select('id, auth_user_id, role, status, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!target) return err('NOT_FOUND', 'Business user not found.', 404)

  // Prevent removing the last active owner
  if (target.role === 'owner') {
    const { count } = await supabase
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', target.tenant_id)
      .eq('role', 'owner')
      .eq('status', 'active')

    if ((count ?? 0) <= 1) {
      return err('LAST_OWNER', 'Cannot remove the only active owner for this tenant.', 409)
    }
  }

  // Soft-delete: set status disabled + clear auth_user_id link
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('users')
    .update({ status: 'disabled', updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) {
    console.error('[DELETE /api/owner/business-users/[id]]', error.message)
    return err('SERVER_ERROR', 'Failed to remove user.', 500)
  }

  // Sync app_metadata
  if (target.auth_user_id) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).auth.admin.updateUserById(target.auth_user_id, {
        app_metadata: { status: 'disabled', approved: false },
      })
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, id, status: 'disabled' })
}
