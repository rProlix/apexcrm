// app/api/customer-invites/accept/route.ts
// POST /api/customer-invites/accept — customer accepts an invite and creates/links their account

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/invites/inviteHelpers'

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, error: message }, { status })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('INVALID_JSON', 'Request body must be valid JSON.', 400)
  }

  const token    = typeof body.token    === 'string' ? body.token.trim() : ''
  const password = typeof body.password === 'string' ? body.password : null
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : null
  const phone    = typeof body.phone    === 'string' ? body.phone.trim() : null

  if (!token) return err('MISSING_TOKEN', 'Token is required.', 400)

  const tokenHash = hashToken(token)
  const supabase  = getSupabaseServerClient()

  // Validate invite via service role
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite } = await (supabase as any)
    .from('customer_invites')
    .select('id, tenant_id, customer_id, email, full_name, phone, status, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!invite) return err('INVITE_NOT_FOUND', 'This invite link is invalid or has already been used.', 404)
  if (invite.status === 'revoked')  return err('INVITE_REVOKED',  'This invite has been revoked.', 410)
  if (invite.status === 'accepted') return err('INVITE_ACCEPTED', 'This invite has already been accepted.', 409)
  if (invite.status === 'expired')  return err('INVITE_EXPIRED',  'This invite has expired.', 410)
  if (new Date(invite.expires_at) < new Date()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('customer_invites').update({ status: 'expired' }).eq('id', invite.id)
    return err('INVITE_EXPIRED', 'This invite has expired.', 410)
  }

  const tenantId   = invite.tenant_id as string
  const inviteEmail = (invite.email as string).toLowerCase()

  let authUserId: string

  // ── Flow 1: check for an existing session ────────────────────────────────
  const sessionClient = await createSessionServerClient()
  const { data: { user: sessionUser } } = await sessionClient.auth.getUser()

  if (sessionUser) {
    // User is already logged in
    // Verify email matches the invite (unless it's a business user accepting for a customer)
    const isBusinessUser = await (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from('users')
        .select('id, role')
        .eq('auth_user_id', sessionUser.id)
        .eq('status', 'active')
        .maybeSingle()
      return !!data
    })()

    if (!isBusinessUser && sessionUser.email?.toLowerCase() !== inviteEmail) {
      return err(
        'EMAIL_MISMATCH',
        `This invite was sent to ${inviteEmail}. Please sign in with that email address to accept.`,
        409
      )
    }

    authUserId = sessionUser.id
  } else {
    // ── Flow 2: no session — create account or sign in ──────────────────────
    if (!password) {
      return err('PASSWORD_REQUIRED', 'A password is required to create your account.', 400)
    }
    if (password.length < 6) {
      return err('WEAK_PASSWORD', 'Password must be at least 6 characters.', 400)
    }

    // Try to create a new user (service role — creates without email confirmation)
    const { data: newUser, error: signupError } = await supabase.auth.admin.createUser({
      email:             inviteEmail,
      password,
      email_confirm:     true, // skip email confirmation since we're using invite as verification
      user_metadata: {
        full_name:  fullName ?? invite.full_name ?? '',
        role:       'customer',
        tenant_id:  tenantId,
      },
    })

    if (signupError) {
      // If user already exists, try to use existing user
      if (signupError.message?.includes('already') || signupError.message?.includes('registered')) {
        // Look up existing auth user by email
        const { data: existing } = await supabase.auth.admin.listUsers()
        const found = existing?.users?.find((u) => u.email?.toLowerCase() === inviteEmail)
        if (!found) {
          return err('AUTH_ERROR', 'An account with this email already exists. Please sign in first.', 409)
        }
        authUserId = found.id
      } else {
        console.error('[POST /api/customer-invites/accept] auth.admin.createUser:', signupError.message)
        return err('AUTH_ERROR', 'Failed to create account. Please try again.', 500)
      }
    } else if (!newUser?.user) {
      return err('AUTH_ERROR', 'Account creation failed. Please try again.', 500)
    } else {
      authUserId = newUser.user.id
    }
  }

  // ── Resolve customer record ─────────────────────────────────────────────────
  let customerId: string

  if (invite.customer_id) {
    customerId = invite.customer_id as string

    // Update customer name/phone if provided
    if (fullName || phone) {
      const updates: Record<string, string> = {}
      if (fullName) updates.name = fullName
      if (phone)    updates.phone = phone
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('customers')
        .update(updates)
        .eq('id', customerId)
        .eq('tenant_id', tenantId)
    }
  } else {
    // Find or create customer by email
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingCustomer } = await (supabase as any)
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', inviteEmail)
      .maybeSingle()

    if (existingCustomer) {
      customerId = existingCustomer.id
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newCustomer, error: custError } = await (supabase as any)
        .from('customers')
        .insert({
          tenant_id: tenantId,
          name:      fullName ?? invite.full_name ?? inviteEmail,
          email:     inviteEmail,
          phone:     phone ?? invite.phone ?? null,
        })
        .select('id')
        .single()

      if (custError || !newCustomer) {
        console.error('[POST /api/customer-invites/accept] create customer:', custError?.message)
        return err('SERVER_ERROR', 'Failed to create customer record.', 500)
      }

      customerId = newCustomer.id

      // Link invite to customer
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('customer_invites')
        .update({ customer_id: customerId })
        .eq('id', invite.id)
    }
  }

  // ── Upsert customer_accounts ────────────────────────────────────────────────
  // Check if this auth user already has an account for this tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingAccount } = await (supabase as any)
    .from('customer_accounts')
    .select('id, tenant_id, status')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (existingAccount && existingAccount.tenant_id !== tenantId) {
    // User already linked to a different tenant — auth_user_id has a unique constraint
    // Update the existing account to point to this invite's tenant/customer
    // (This allows "re-linking" — business should be aware)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .from('customer_accounts')
      .update({
        tenant_id:   tenantId,
        customer_id: customerId,
        email:       inviteEmail,
        status:      'active',
        invite_id:   invite.id,
      })
      .eq('id', existingAccount.id)

    if (updateErr) {
      console.error('[POST /api/customer-invites/accept] update account:', updateErr.message)
      return err('SERVER_ERROR', 'Failed to link account. Please contact support.', 500)
    }
  } else {
    // Insert or update account for this tenant
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertErr } = await (supabase as any)
      .from('customer_accounts')
      .upsert({
        tenant_id:    tenantId,
        customer_id:  customerId,
        auth_user_id: authUserId,
        email:        inviteEmail,
        status:       'active',
        invite_id:    invite.id,
      }, { onConflict: 'auth_user_id' })

    if (upsertErr) {
      console.error('[POST /api/customer-invites/accept] upsert account:', upsertErr.message)
      return err('SERVER_ERROR', 'Failed to create portal account. Please try again.', 500)
    }
  }

  // ── Mark invite accepted ────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('customer_invites')
    .update({
      status:      'accepted',
      accepted_at: new Date().toISOString(),
      customer_id: customerId,
    })
    .eq('id', invite.id)

  // Build redirect target — customer portal
  const redirectTo = '/portal'

  return NextResponse.json({
    ok: true,
    redirectTo,
    tenantId,
    customerId,
    authUserId,
  })
}
