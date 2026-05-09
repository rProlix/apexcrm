// app/api/owner/business-users/route.ts
// POST /api/owner/business-users — owner creates a business role account
// GET  /api/owner/business-users?tenantId=... — list business users for a tenant

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { BUSINESS_ROLES, ALL_BUSINESS_ROLES } from '@/lib/types/businessUsers'
import type { BusinessRole, BusinessUserStatus } from '@/lib/types/businessUsers'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com'

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, error: message }, { status })
}

// ─── POST /api/owner/business-users ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx)               return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (ctx.role !== 'owner') return err('FORBIDDEN', 'Only the platform owner can create business accounts.', 403)

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return err('SUPABASE_SERVICE_ROLE_NOT_CONFIGURED', 'Service role key is not configured.', 500)

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('INVALID_JSON', 'Request body must be valid JSON.', 400)
  }

  const tenantId  = typeof body.tenantId  === 'string' ? body.tenantId.trim()  : ''
  const email     = typeof body.email     === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName  = typeof body.fullName  === 'string' ? body.fullName.trim()  : ''
  const role      = typeof body.role      === 'string' ? body.role as BusinessRole : 'staff'
  const password  = typeof body.password  === 'string' ? body.password : ''
  const approved  = body.approved !== false
  const status    = (typeof body.status === 'string' ? body.status : 'active') as BusinessUserStatus

  // Validation
  if (!tenantId) return err('TENANT_NOT_FOUND', 'tenantId is required.', 400)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err('INVALID_EMAIL', 'A valid email address is required.', 400)
  }
  if (!fullName) return err('VALIDATION_ERROR', 'Full name is required.', 400)
  if (!ALL_BUSINESS_ROLES.includes(role)) {
    return err('INVALID_ROLE', `role must be one of: ${ALL_BUSINESS_ROLES.join(', ')}.`, 400)
  }
  // Prevent non-owner creating owner role (owners can create other owners)
  if (role === 'owner' && ctx.role !== 'owner') {
    return err('FORBIDDEN', 'Only the platform owner can assign the owner role.', 403)
  }
  if (!password || password.length < 8) {
    return err('INVALID_PASSWORD', 'Password must be at least 8 characters.', 400)
  }

  const supabase = getSupabaseServerClient()

  // Verify tenant exists
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) return err('TENANT_NOT_FOUND', 'Tenant not found.', 404)

  // Check for existing public.users row for this email + tenant
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, auth_user_id, status')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  if (existingUser) {
    return err(
      'MEMBERSHIP_ALREADY_EXISTS',
      `A user with email ${email} already exists in this business. Update their account via the edit action.`,
      409
    )
  }

  // ── Create Supabase Auth user ─────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: authData, error: authError } = await (supabase as any).auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification — owner created = verified
    user_metadata: {
      full_name:    fullName,
      role,
      tenant_id:    tenantId,
      account_type: 'business',
    },
    app_metadata: {
      role,
      tenant_id:    tenantId,
      account_type: 'business',
      approved:     true,
      status:       'active',
    },
  })

  if (authError) {
    console.error('[POST /api/owner/business-users] auth.admin.createUser:', authError.message)

    if (authError.message?.toLowerCase().includes('already') || authError.message?.toLowerCase().includes('registered')) {
      // Auth user exists — look up by email and link membership
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: existingAuth } = await (supabase as any).auth.admin.listUsers()
      const found = (existingAuth?.users ?? []).find(
        (u: { email?: string }) => u.email?.toLowerCase() === email
      )

      if (!found) {
        return err('AUTH_CREATE_FAILED', 'Failed to create account. Please try again.', 500)
      }

      // Check if this auth user already has a membership in this tenant
      const { data: existingMembership } = await supabase
        .from('users')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('auth_user_id', found.id)
        .maybeSingle()

      if (existingMembership) {
        return err('MEMBERSHIP_ALREADY_EXISTS', 'This user already has access to this business.', 409)
      }

      // Link existing auth user
      return await createMembershipRow(supabase, {
        tenantId, email, fullName, role, approved, status,
        authUserId: found.id, createdBy: ctx.id,
      })
    }

    return err('AUTH_CREATE_FAILED', `Failed to create auth account: ${authError.message}`, 500)
  }

  const authUserId = authData.user?.id
  if (!authUserId) return err('AUTH_CREATE_FAILED', 'Auth user creation returned no ID.', 500)

  return await createMembershipRow(supabase, {
    tenantId, email, fullName, role, approved, status,
    authUserId, createdBy: ctx.id,
  })
}

async function createMembershipRow(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  opts: {
    tenantId:   string
    email:      string
    fullName:   string
    role:       BusinessRole
    approved:   boolean
    status:     BusinessUserStatus
    authUserId: string
    createdBy:  string
  }
) {
  const { tenantId, email, fullName, role, approved, status, authUserId, createdBy } = opts

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: membership, error: membershipError } = await (supabase as any)
    .from('users')
    .insert({
      tenant_id:    tenantId,
      auth_user_id: authUserId,
      email,
      full_name:    fullName,
      role,
      status,
      approved,
      approved_by:  createdBy,
      approved_at:  new Date().toISOString(),
      metadata: {
        created_by:  createdBy,
        created_at:  new Date().toISOString(),
        account_type: 'business',
      },
    })
    .select('id, email, full_name, role, status, approved')
    .single()

  if (membershipError || !membership) {
    console.error('[POST /api/owner/business-users] insert users:', membershipError?.message)
    // Best-effort: delete the auth user to avoid orphaned accounts
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).auth.admin.deleteUser(authUserId)
    } catch { /* no-op */ }
    return NextResponse.json(
      { ok: false, code: 'MEMBERSHIP_CREATE_FAILED', error: 'Failed to create membership record.' },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok:       true,
    user: {
      id:           membership.id,
      authUserId,
      tenantId,
      email,
      fullName:     membership.full_name,
      role:         membership.role,
      status:       membership.status,
      approved:     membership.approved,
    },
    loginUrl: `${APP_URL}/login`,
  }, { status: 201 })
}

// ─── GET /api/owner/business-users ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx)               return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (ctx.role !== 'owner') return err('FORBIDDEN', 'Only the platform owner can list business users.', 403)

  const tenantId = req.nextUrl.searchParams.get('tenantId')
  if (!tenantId) return err('TENANT_NOT_FOUND', 'tenantId query parameter is required.', 400)

  const supabase = getSupabaseServerClient()

  // Verify tenant belongs to platform
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) return err('TENANT_NOT_FOUND', 'Tenant not found.', 404)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: users, error } = await (supabase as any)
    .from('users')
    .select('id, auth_user_id, email, full_name, role, status, approved, approved_at, created_at, updated_at, metadata')
    .eq('tenant_id', tenantId)
    .in('role', ALL_BUSINESS_ROLES)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('[GET /api/owner/business-users]', error.message)
    return err('SERVER_ERROR', 'Failed to load business users.', 500)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = (users ?? []).map((u: any) => ({
    id:           u.id,
    auth_user_id: u.auth_user_id,
    email:        u.email,
    fullName:     u.full_name,
    role:         u.role as BusinessRole,
    status:       u.status as BusinessUserStatus,
    approved:     u.approved,
    approved_at:  u.approved_at,
    created_at:   u.created_at,
    metadata:     u.metadata ?? {},
  }))

  return NextResponse.json({ ok: true, members })
}

// Suppress unused import warning
void BUSINESS_ROLES
