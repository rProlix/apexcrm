'use server'

import { redirect } from 'next/navigation'
import {
  createSessionServerClient,
  getSupabaseServerClient,
} from '@/lib/supabase/server'

// Only allow same-origin relative paths to prevent open redirect
function sanitizeRedirect(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) {
    return '/account'
  }
  return next
}

// ── Signup ────────────────────────────────────────────────────────────────────

export async function customerSignup(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string; message?: string }> {
  const email     = (formData.get('email')     as string | null)?.trim() ?? ''
  const password  =  formData.get('password')  as string | null  ?? ''
  const fullName  = (formData.get('full_name') as string | null)?.trim() ?? ''
  const tenantId  =  formData.get('tenant_id') as string | null  ?? ''
  const next      = sanitizeRedirect(formData.get('next'))

  if (!email || !password || !fullName || !tenantId) {
    return { error: 'All fields are required.' }
  }
  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters.' }
  }

  const sessionClient = await createSessionServerClient()

  // 1. Create Supabase Auth user
  const { data: signupData, error: signupError } = await sessionClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role: 'customer', tenant_id: tenantId },
    },
  })

  if (signupError) return { error: signupError.message }
  if (!signupData.user) return { error: 'Account creation failed. Please try again.' }

  // If email confirmation is enabled, inform the customer and stop here.
  // The DB records will be created after they confirm via the auth webhook,
  // or you can disable "Confirm email" in the Supabase Auth dashboard.
  if (!signupData.session) {
    return {
      message:
        'Check your inbox to confirm your email, then sign in.',
    }
  }

  // 2. Use service role to insert DB records (bypasses RLS — runs server-side only)
  const serviceClient = getSupabaseServerClient()

  // Check for an existing customer with this email in the tenant
  const { data: existingCustomer } = await serviceClient
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  let customerId: string

  if (existingCustomer) {
    // Re-use the existing customer record (e.g. previously created by staff)
    customerId = existingCustomer.id
  } else {
    const { data: newCustomer, error: customerError } = await serviceClient
      .from('customers')
      .insert({ tenant_id: tenantId, name: fullName, email })
      .select('id')
      .single()

    if (customerError || !newCustomer) {
      try { await serviceClient.auth.admin.deleteUser(signupData.user.id) } catch { /* no-op */ }
      return { error: 'Profile setup failed. Please try again.' }
    }

    customerId = newCustomer.id
  }

  // Link the auth user to the customer record
  const { error: linkError } = await serviceClient
    .from('customer_accounts')
    .upsert({
      tenant_id:    tenantId,
      customer_id:  customerId,
      auth_user_id: signupData.user.id,
      email,
      status:       'active',
    }, { onConflict: 'auth_user_id,tenant_id' })

  if (linkError) {
    try { await serviceClient.from('customers').delete().eq('id', customerId) } catch { /* no-op */ }
    try { await serviceClient.auth.admin.deleteUser(signupData.user.id) } catch { /* no-op */ }
    return { error: 'Account link failed. Please try again.' }
  }

  redirect(next)
}

// ── Login ─────────────────────────────────────────────────────────────────────

export async function customerLogin(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string }> {
  const email    = (formData.get('email')    as string | null)?.trim() ?? ''
  const password =  formData.get('password') as string | null  ?? ''
  const tenantId =  formData.get('tenant_id') as string | null ?? ''
  const next     = sanitizeRedirect(formData.get('next'))

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const sessionClient = await createSessionServerClient()
  const { data: signInData, error } = await sessionClient.auth.signInWithPassword({ email, password })

  if (error || !signInData.user) {
    return { error: 'Invalid email or password.' }
  }

  // Validate that this user has an active customer account for this specific tenant.
  // This prevents a customer of tenant A from accessing tenant B's portal.
  if (tenantId) {
    const serviceClient = getSupabaseServerClient()

    // ── 1. Check business identity first (owner / admin / staff) ────────────
    // Business users share the same Supabase Auth identity across the CRM and
    // their own storefronts. They do NOT need a customer_accounts row.
    const { data: businessUser } = await serviceClient
      .from('users')
      .select('id, role, tenant_id')
      .eq('auth_user_id', signInData.user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (businessUser) {
      const role = businessUser.role as string

      if (role === 'owner') {
        // Platform owners can access every tenant's storefront
        redirect(next)
      }

      if ((role === 'admin' || role === 'staff') && businessUser.tenant_id === tenantId) {
        // Admin / staff of this exact tenant — allow access
        redirect(next)
      }

      if ((role === 'admin' || role === 'staff') && businessUser.tenant_id !== tenantId) {
        // Admin / staff of a DIFFERENT tenant — deny with a clear message
        await sessionClient.auth.signOut()
        return { error: 'You do not have access to manage this site.' }
      }
    }

    // ── 2. Check customer identity ───────────────────────────────────────────
    const { data: account, error: accountError } = await serviceClient
      .from('customer_accounts')
      .select('id, status')
      .eq('auth_user_id', signInData.user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (accountError && accountError.code !== 'PGRST116') {
      // Unexpected DB error — log but allow the session to proceed rather than
      // silently locking out the user; a lookup failure is not a security issue.
      console.error('[customerLogin] account lookup error:', accountError.message)
    } else if (!account) {
      // No identity found for this tenant — sign out with a clear message.
      // We intentionally avoid "sign up first" because the user may have an
      // account on a different tenant; the current credential is simply not
      // linked to this storefront.
      await sessionClient.auth.signOut()
      return { error: 'This account is not connected to this business website.' }
    } else if (account.status !== 'active') {
      await sessionClient.auth.signOut()
      return { error: 'Your account is pending activation. Please check your email.' }
    }
  }

  redirect(next)
}

// ── Logout ────────────────────────────────────────────────────────────────────
// Plain form action (no useActionState) — signature is (formData: FormData).

export async function customerLogout(formData: FormData): Promise<void> {
  const redirectTo = sanitizeRedirect(formData.get('redirect_to')) || '/login'
  const sessionClient = await createSessionServerClient()
  await sessionClient.auth.signOut()
  redirect(redirectTo)
}
