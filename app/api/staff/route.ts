// app/api/staff/route.ts
// GET  — list tenant staff (owner never included)
// POST — invite a new staff member (owner role is blocked)
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getTenantStaff } from '@/lib/staff/getTenantStaff'
import { getSupabaseServerClient } from '@/lib/supabase/server'

const ALLOWED_ROLES = ['admin', 'staff'] as const

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

/**
 * GET /api/staff
 *
 * Returns staff members for the caller's tenant.
 * Owner accounts are NEVER included in the response.
 *
 * Access: admin, owner
 */
export async function GET() {
  const ctx = await getUserContext()

  if (!ctx)                                   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden()

  // Owner without a tenant_id means they're not scoped to any tenant
  const tenantId = ctx.tenant_id
  if (!tenantId) return NextResponse.json({ staff: [] })

  const staff = await getTenantStaff(tenantId)
  return NextResponse.json({ staff })
}

/**
 * POST /api/staff
 *
 * Body: { email: string; role: 'admin' | 'staff' }
 *
 * Creates a pending invite record. The invited user must complete sign-up.
 * owner role is explicitly rejected — cannot be assigned via this endpoint.
 *
 * Access: admin, owner
 */
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()

  if (!ctx)                                   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden()

  const tenantId = ctx.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'No tenant context' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { email, role = 'staff' } = body

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  // Hard block on owner role — never allow escalation via invite
  if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
    return NextResponse.json(
      { error: `role must be one of: ${ALLOWED_ROLES.join(', ')}` },
      { status: 400 }
    )
  }

  const cleanEmail = (email as string).toLowerCase().trim()
  const db = getSupabaseServerClient()

  // Duplicate check — scoped to tenant and non-owner roles
  const { data: existing } = await db
    .from('users')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', cleanEmail)
    .neq('role', 'owner')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'A team member with this email already exists' },
      { status: 409 }
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (db.from('users') as any)
    .insert({
      tenant_id: tenantId,
      email:     cleanEmail,
      role,
      status:    'invited',
      metadata:  {
        invited_by: ctx.id,
        invited_at: new Date().toISOString(),
      },
    })
    .select('id, email, role, status, created_at, metadata')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ staff: data }, { status: 201 })
}
