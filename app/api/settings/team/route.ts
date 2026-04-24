// app/api/settings/team/route.ts
// GET  — list tenant staff (owner excluded)
// POST — invite staff (role escalation to owner blocked)
// PATCH — update staff role (owner rows are immutable)
// DELETE — remove staff member (owner rows are protected)
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['admin', 'staff'] as const

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

// ── Shared: resolve caller and enforce baseline guards ────────────────────────
async function resolveCaller() {
  const ctx = await getUserContext()

  if (!ctx)                                         return { ok: false as const, res: forbidden() }
  if (!['owner', 'admin'].includes(ctx.role))       return { ok: false as const, res: forbidden() }
  if (ctx.role !== 'owner' && !ctx.tenant_id)       return { ok: false as const, res: NextResponse.json({ error: 'No tenant' }, { status: 400 }) }

  return { ok: true as const, ctx }
}

// ── GET /api/settings/team ─────────────────────────────────────────────────────
// Returns staff for the caller's tenant. Owner accounts are NEVER returned.
export async function GET() {
  const auth = await resolveCaller()
  if (!auth.ok) return auth.res

  const { ctx } = auth
  const tenantId = ctx.role === 'owner'
    ? ctx.tenant_id          // owner scoped to their own tenant if set
    : ctx.tenant_id!

  if (!tenantId) {
    return NextResponse.json({ members: [] })
  }

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('users')
    .select('id, email, role, status, created_at, metadata')
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')                           // ← CRITICAL: never return owner
    .in('role', ALLOWED_ROLES)                      // only admin/staff
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ members: data ?? [] })
}

// ── POST /api/settings/team ────────────────────────────────────────────────────
// Invite a new team member. Owner role is explicitly blocked.
export async function POST(req: NextRequest) {
  const auth = await resolveCaller()
  if (!auth.ok) return auth.res

  const { ctx } = auth
  const tenantId = ctx.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const { email, role = 'staff' } = body ?? {}

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  // Block escalation to owner — hardcoded, not just a validation message
  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  const db = getSupabaseServerClient()

  // Duplicate check (scoped to tenant, excluding owner rows)
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email.toLowerCase().trim())
    .neq('role', 'owner')
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from('users') as any)
    .insert({
      tenant_id: tenantId,
      email:     email.toLowerCase().trim(),
      role,
      status:    'invited',
      metadata:  {
        invited_by: ctx.id,            // track who invited this member
        invited_at: new Date().toISOString(),
      },
    })
    .select('id, email, role, status, created_at, metadata')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ member: data }, { status: 201 })
}

// ── PATCH /api/settings/team ───────────────────────────────────────────────────
// Update a team member's role. Cannot target an owner; cannot assign owner role.
export async function PATCH(req: NextRequest) {
  const auth = await resolveCaller()
  if (!auth.ok) return auth.res

  const { ctx } = auth
  const tenantId = ctx.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const { user_id, role } = body ?? {}

  if (!user_id || !role) {
    return NextResponse.json({ error: 'user_id and role are required' }, { status: 400 })
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  // Prevent self role-change
  if (user_id === ctx.id) {
    return NextResponse.json({ error: 'Cannot change your own role' }, { status: 400 })
  }

  const db = getSupabaseServerClient()

  // Verify the target exists, belongs to this tenant, and is NOT an owner
  const { data: target } = await db
    .from('users')
    .select('id, role')
    .eq('id', user_id)
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')                           // ← block targeting owner rows
    .maybeSingle()

  if (!target) {
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('users') as any)
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', user_id)
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')                           // double-lock on the UPDATE

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── DELETE /api/settings/team ──────────────────────────────────────────────────
// Remove a team member. Cannot target: owner, self, or cross-tenant users.
export async function DELETE(req: NextRequest) {
  const auth = await resolveCaller()
  if (!auth.ok) return auth.res

  const { ctx } = auth
  const tenantId = ctx.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const body = await req.json().catch(() => null)
  const { user_id } = body ?? {}

  if (!user_id) return NextResponse.json({ error: 'user_id is required' }, { status: 400 })

  if (user_id === ctx.id) {
    return NextResponse.json({ error: 'Cannot remove yourself' }, { status: 400 })
  }

  const db = getSupabaseServerClient()

  // Fetch the target user — ensure they exist in this tenant and are NOT owner
  const { data: target } = await db
    .from('users')
    .select('id, role, metadata')
    .eq('id', user_id)
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')                           // ← CRITICAL: block deleting owner
    .maybeSingle()

  if (!target) {
    // Return 404 for both "not found" and "is owner" — don't reveal which
    return NextResponse.json({ error: 'Staff member not found' }, { status: 404 })
  }

  // Non-owner admins may only delete staff they personally invited
  if (ctx.role === 'admin') {
    const invitedBy = (target.metadata as Record<string, unknown>)?.invited_by
    if (invitedBy && invitedBy !== ctx.id) {
      return NextResponse.json(
        { error: 'You can only remove staff members you invited' },
        { status: 403 }
      )
    }
  }

  const { error } = await db
    .from('users')
    .delete()
    .eq('id', user_id)
    .eq('tenant_id', tenantId)
    .neq('role', 'owner')                           // final safety net on DELETE

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
