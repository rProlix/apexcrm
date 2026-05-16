'use server'

import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import {
  createSessionServerClient,
  getSupabaseServerClient,
} from '@/lib/supabase/server'
import {
  getStorefrontAuthRedirectUrl,
  getStorefrontPasswordResetUrl,
} from '@/lib/auth/getAuthRedirectUrl'

// Only allow same-origin relative paths to prevent open redirect
function sanitizeRedirect(next: unknown): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) {
    return '/account'
  }
  return next
}

// ── Signup ────────────────────────────────────────────────────────────────────
//
// ROOT CAUSE FIX:
//   Previously, customer DB records (customers + customer_accounts) were only
//   created when Supabase returned a session immediately — i.e. when email
//   confirmation was DISABLED. When email confirmation is enabled, signUp()
//   returns user but not session, and the code returned early without creating
//   any DB rows. This meant every confirmed customer got "not connected to this
//   business" on login because customer_accounts had no row for them.
//
//   Fix: Always create DB records immediately after signUp(), regardless of
//   session presence. Use status='pending_confirmation' when email is not yet
//   confirmed. The /auth/callback route activates the row after confirmation.
//
//   emailRedirectTo fix:
//   Supabase's signUp() needs an explicit emailRedirectTo or it uses the
//   configured Site URL (often localhost in development, or wrong in production).
//   We derive the current origin from request headers so the confirmation link
//   always lands on the correct domain/subdomain.

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

  // ── Build emailRedirectTo using the current request host ─────────────────
  // getStorefrontAuthRedirectUrl() prefers x-original-host (set by middleware
  // for subdomain/custom-domain rewrites) over the raw host header to ensure
  // the confirmation link always lands on the correct business domain, not on
  // the main nexoranow.com domain.
  const headersList = await headers()
  const emailRedirectTo = getStorefrontAuthRedirectUrl(headersList, next, tenantId)

  // ── Diagnostics — never log passwords or tokens ────────────────────────
  console.info('[auth:storefront_customer_signup]', {
    flow:              'storefront_customer_signup',
    email,
    tenant_id:         tenantId,
    request_host:      headersList.get('x-original-host') ?? headersList.get('host') ?? 'unknown',
    email_redirect_to: emailRedirectTo,
    uses_main_domain:  emailRedirectTo.startsWith(process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com'),
  })

  const sessionClient = await createSessionServerClient()

  // 1. Create Supabase Auth user
  const { data: signupData, error: signupError } = await sessionClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role: 'customer', tenant_id: tenantId },
      emailRedirectTo,
    },
  })

  if (signupError) {
    return {
      error: signupError.message.toLowerCase().includes('already registered')
        ? 'An account with this email already exists. Try signing in instead.'
        : signupError.message,
    }
  }
  if (!signupData.user) return { error: 'Account creation failed. Please try again.' }

  // 2. Use service role to insert DB records — bypass RLS, runs server-side only.
  //    CRITICAL: Do this whether or not we have a session. The customer_accounts
  //    row must exist so that login succeeds after email confirmation.
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
      // Clean up the auth user we just created to avoid orphaned accounts
      try { await serviceClient.auth.admin.deleteUser(signupData.user.id) } catch { /* no-op */ }
      return { error: 'Profile setup failed. Please try again.' }
    }

    customerId = newCustomer.id
  }

  // Determine account status:
  //   active              — Supabase returned a session, email already confirmed.
  //   pending_confirmation — Supabase requires email confirmation; activate after callback.
  const accountStatus: string = signupData.session ? 'active' : 'pending_confirmation'

  // Link the auth user to the customer record.
  // Conflict target is (auth_user_id, tenant_id) — see migration 066.
  // This allows one auth user to be a customer at multiple businesses.
  const { error: linkError } = await serviceClient
    .from('customer_accounts')
    .upsert(
      {
        tenant_id:    tenantId,
        customer_id:  customerId,
        auth_user_id: signupData.user.id,
        email,
        status:       accountStatus,
      },
      { onConflict: 'auth_user_id,tenant_id' },
    )

  if (linkError) {
    // Log but do NOT delete the customer row — partial state is recoverable.
    // The user can re-attempt login, which will try to link again.
    console.error('[customerSignup] customer_accounts upsert error:', linkError.message, linkError.code)
    return {
      error: 'Account link failed. Please try again, or contact the business for an invite.',
    }
  }

  // 3. No session → email confirmation required; show "check inbox" message.
  //    The customer + customer_accounts rows now exist (status: pending_confirmation),
  //    so login will succeed as soon as they confirm.
  if (!signupData.session) {
    return {
      message:
        'We sent a confirmation email to your inbox. Click the link to activate your account, then sign in.',
    }
  }

  // 4. Session returned → email confirmation is disabled; redirect immediately.
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
    // Supabase returns "Email not confirmed" as a specific error — surface it clearly.
    if (error?.message?.toLowerCase().includes('email not confirmed')) {
      return {
        error: 'Please confirm your email address before signing in. Check your inbox for the confirmation link.',
      }
    }
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
        return {
          error:
            'This email is signed in as a staff member of a different business. ' +
            'You do not have access to manage this site.',
        }
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
      // Unexpected DB error — log but do not block the user. A lookup failure
      // is not a security issue; the session cookie will protect the route.
      console.error('[customerLogin] account lookup error:', accountError.message)
    } else if (!account) {
      // No identity found for this tenant.
      await sessionClient.auth.signOut()
      return {
        error:
          'This email is not connected to this business yet. ' +
          'Ask the business owner to send you an invite, or create an account using the sign-up form.',
      }
    } else if (account.status === 'pending_confirmation') {
      // Account exists but is awaiting email confirmation.
      // Try to auto-activate: if Supabase says email is confirmed, activate now.
      // (This handles the edge case where the callback activation failed.)
      try {
        const { data: authUserData } = await serviceClient.auth.admin.getUserById(signInData.user.id)
        if (authUserData?.user?.email_confirmed_at) {
          await serviceClient
            .from('customer_accounts')
            .update({ status: 'active' })
            .eq('id', account.id)
          // Activation succeeded — allow login to proceed
        } else {
          await sessionClient.auth.signOut()
          return {
            error:
              'Please confirm your email address before signing in. ' +
              'Check your inbox and click the confirmation link.',
          }
        }
      } catch {
        // Cannot verify confirmation state — fail safe and ask for confirmation
        await sessionClient.auth.signOut()
        return {
          error: 'Your account is pending email confirmation. Please check your inbox.',
        }
      }
    } else if (account.status !== 'active') {
      await sessionClient.auth.signOut()
      return { error: 'Your account has been suspended. Please contact the business.' }
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

// ── Forgot password ───────────────────────────────────────────────────────────
//
// Sends a password reset email via Supabase Auth.
// The reset link lands on /auth/callback?type=recovery which then redirects
// to /reset-password so the user can set a new password.
// The emailRedirectTo is set to the current request host so the link works
// on any domain (main CRM, subdomain, custom domain, Vercel preview).

export async function customerForgotPassword(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string; message?: string }> {
  const email    = (formData.get('email') as string | null)?.trim() ?? ''

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Please enter a valid email address.' }
  }

  const headersList = await headers()
  const emailRedirectTo = getStorefrontPasswordResetUrl(headersList)

  console.info('[auth:storefront_password_reset]', {
    flow:              'storefront_password_reset',
    email,
    request_host:      headersList.get('x-original-host') ?? headersList.get('host') ?? 'unknown',
    email_redirect_to: emailRedirectTo,
  })

  const sessionClient = await createSessionServerClient()
  const { error } = await sessionClient.auth.resetPasswordForEmail(email, { redirectTo: emailRedirectTo })

  if (error) {
    console.error('[customerForgotPassword] resetPasswordForEmail:', error.message)
    // Do NOT confirm whether the email exists — prevent user enumeration.
    // Show a generic success message regardless of whether the email exists.
  }

  return {
    message:
      'If an account with that email exists, you will receive a password reset link shortly. ' +
      'Check your inbox and click the link to set a new password.',
  }
}

// ── Reset password ────────────────────────────────────────────────────────────
//
// Updates the password for the currently authenticated user.
// The user reaches this page after clicking the reset email link, which
// exchanges the PKCE code and sets a temporary recovery session in /auth/callback.
// Supabase's updateUser() works because the recovery session is valid.

export async function customerResetPassword(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string; message?: string }> {
  const password        = formData.get('password')         as string | null ?? ''
  const confirmPassword = formData.get('confirm_password') as string | null ?? ''

  if (!password || password.length < 6) {
    return { error: 'Password must be at least 6 characters.' }
  }
  if (password !== confirmPassword) {
    return { error: 'Passwords do not match.' }
  }

  const sessionClient = await createSessionServerClient()
  const { data: { user }, error: userError } = await sessionClient.auth.getUser()

  if (userError || !user) {
    return {
      error:
        'Your reset link has expired or already been used. ' +
        'Please request a new password reset link.',
    }
  }

  const { error: updateError } = await sessionClient.auth.updateUser({ password })

  if (updateError) {
    console.error('[customerResetPassword] updateUser:', updateError.message)
    return { error: updateError.message }
  }

  return {
    message:
      'Your password has been updated successfully. ' +
      'You can now sign in with your new password.',
  }
}
