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

  const { data: customer, error: customerError } = await serviceClient
    .from('customers')
    .insert({ tenant_id: tenantId, name: fullName, email })
    .select('id')
    .single()

  if (customerError || !customer) {
    // Best-effort cleanup — don't leave orphaned auth users
    try { await serviceClient.auth.admin.deleteUser(signupData.user.id) } catch { /* no-op */ }
    return { error: 'Profile setup failed. Please try again.' }
  }

  const { error: linkError } = await serviceClient
    .from('customer_accounts')
    .insert({
      tenant_id:    tenantId,
      customer_id:  customer.id,
      auth_user_id: signupData.user.id,
      email,
    })

  if (linkError) {
    try { await serviceClient.from('customers').delete().eq('id', customer.id) } catch { /* no-op */ }
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
  const next     = sanitizeRedirect(formData.get('next'))

  if (!email || !password) {
    return { error: 'Email and password are required.' }
  }

  const sessionClient = await createSessionServerClient()
  const { error } = await sessionClient.auth.signInWithPassword({ email, password })

  if (error) {
    // Return a generic message — never leak whether the email exists
    return { error: 'Invalid email or password.' }
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
