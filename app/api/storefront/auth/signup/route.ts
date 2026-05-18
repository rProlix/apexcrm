// app/api/storefront/auth/signup/route.ts
//
// Server-side signup endpoint for CUSTOMER storefront accounts.
//
// Uses a plain supabase-js client (not the session/cookie client) for the
// auth.signUp() call to avoid cookie-domain interference. The session client
// is only needed AFTER sign-in; signup produces no session when email
// confirmation is enabled.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getRequestOrigin, sanitizeNextPath } from '@/lib/auth/redirects'

function err(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

export async function POST(request: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return err('Request body must be valid JSON.', 400)
  }

  const email    = typeof body.email     === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password  === 'string' ? body.password                   : ''
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim()           : ''
  const tenantId = typeof body.tenant_id === 'string' ? body.tenant_id                 : ''
  const next     = sanitizeNextPath(typeof body.next === 'string' ? body.next : null, '/account')

  if (!email || !password || !fullName || !tenantId) {
    return err('All fields are required.', 400)
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err('Please enter a valid email address.', 400)
  }
  if (password.length < 6) {
    return err('Password must be at least 6 characters.', 400)
  }

  // ── Build emailRedirectTo from request.url ─────────────────────────────────
  //
  // request.url is the exact URL the browser sent — e.g.:
  //   https://erickvcontacf.nexoranow.com/api/storefront/auth/signup
  // getRequestOrigin() returns:
  //   https://erickvcontacf.nexoranow.com
  //
  // The resulting emailRedirectTo:
  //   https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount&tenant_id=…
  const origin          = getRequestOrigin(request)
  const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(next)}&tenant_id=${encodeURIComponent(tenantId)}`

  // ── Diagnostics — never log passwords or tokens ────────────────────────────
  console.info('[storefront-signup-redirect]', {
    email,
    tenantId,
    requestUrl:               request.url,
    host:                     request.headers.get('host'),
    forwardedHost:            request.headers.get('x-forwarded-host'),
    generatedEmailRedirectTo: emailRedirectTo,
  })

  // ── Supabase auth: create user ─────────────────────────────────────────────
  //
  // Use a plain supabase-js client (anon key, no cookies) for the signUp call.
  // The session/cookie client is designed for reading/refreshing sessions on
  // authenticated requests. signUp() does not require an existing session and
  // the cookie-domain setup on the session client can interfere with how
  // Supabase processes the response in edge environments.
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL  ?? ''
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''

  if (!supabaseUrl || !supabaseAnon) {
    console.error('[storefront-signup] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return err('Server configuration error. Please contact support.', 500)
  }

  const authClient = createClient(supabaseUrl, supabaseAnon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: signupData, error: signupError } = await authClient.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        full_name:       fullName,
        role:            'customer',
        tenant_id:       tenantId,
        account_type:    'customer',
        signup_origin:   'storefront',
        storefront_host: new URL(request.url).host,
      },
    },
  })

  // ── Log full Supabase response for diagnostics ─────────────────────────────
  console.info('[storefront-signup] supabase.auth.signUp response', {
    email,
    hasUser:            !!signupData?.user,
    hasSession:         !!signupData?.session,
    identitiesCount:    signupData?.user?.identities?.length ?? 'n/a',
    emailConfirmedAt:   signupData?.user?.email_confirmed_at ?? null,
    error:              signupError?.message ?? null,
    emailRedirectTo,
  })

  if (signupError) {
    console.error('[storefront-signup] auth.signUp error:', signupError.message)
    const msg = signupError.message.toLowerCase().includes('already registered')
      ? 'An account with this email already exists. Try signing in instead.'
      : signupError.message
    return err(msg, 400)
  }

  if (!signupData.user) {
    return err('Account creation failed. Please try again.', 500)
  }

  // ── Detect silent "user already exists" ────────────────────────────────────
  //
  // Supabase returns a fake-success response (user object with identities: [])
  // when email confirmation is enabled and the email is already registered.
  // No confirmation email is sent in this case. We surface a friendly message
  // to avoid leaking whether the email is registered.
  const identitiesCount = signupData.user.identities?.length ?? 1
  if (identitiesCount === 0) {
    console.info('[storefront-signup] user already exists (identities: []) — no email sent', { email })
    return NextResponse.json({
      ok:      true,
      confirmed: false,
      message:
        'If this email is not yet registered, you will receive a confirmation link shortly. ' +
        'If you already have an account, please sign in instead.',
    })
  }

  // ── Detect email confirmation disabled ─────────────────────────────────────
  //
  // When Supabase email confirmation is disabled, signUp() returns a session
  // immediately — the user is already active. Redirect them to /account (or
  // whatever `next` is). No confirmation email will be sent.
  if (signupData.session) {
    console.info('[storefront-signup] email confirmation DISABLED — session returned immediately', {
      email,
      note: 'Re-enable email confirmation in Supabase Dashboard → Authentication → Providers → Email',
    })

    // Still create the DB rows below before redirecting
  } else {
    // Normal path: email confirmation enabled — Supabase queued the email.
    console.info('[storefront-signup] confirmation email queued by Supabase', { email, emailRedirectTo })
  }

  // ── DB: find or create customer row ────────────────────────────────────────
  const serviceClient = getSupabaseServerClient()

  const { data: existingCustomer } = await serviceClient
    .from('customers')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .maybeSingle()

  let customerId: string

  if (existingCustomer) {
    customerId = existingCustomer.id
  } else {
    const { data: newCustomer, error: customerError } = await serviceClient
      .from('customers')
      .insert({ tenant_id: tenantId, name: fullName, email })
      .select('id')
      .single()

    if (customerError || !newCustomer) {
      console.error('[storefront-signup] customers insert error:', customerError?.message)
      try { await serviceClient.auth.admin.deleteUser(signupData.user.id) } catch { /* no-op */ }
      return err('Profile setup failed. Please try again.', 500)
    }

    customerId = newCustomer.id
  }

  // ── DB: link auth user → customer_accounts ─────────────────────────────────
  const accountStatus: string = signupData.session ? 'active' : 'pending_confirmation'

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
    console.error('[storefront-signup] customer_accounts upsert error:', linkError.message)
    return err('Account link failed. Please try again, or contact the business.', 500)
  }

  // ── Response ───────────────────────────────────────────────────────────────
  if (signupData.session) {
    // Email confirmation is disabled — user is already active. Redirect them.
    return NextResponse.json({
      ok:        true,
      confirmed: true,
      next,
      _warning: 'Email confirmation is disabled in Supabase. No confirmation email was sent.',
    })
  }

  return NextResponse.json({
    ok:        true,
    confirmed: false,
    message:
      'We sent a confirmation email to your inbox. ' +
      'Click the link to activate your account, then sign in.',
    // Only in non-production for debugging:
    ...(process.env.NODE_ENV !== 'production' && {
      _debug: { emailRedirectTo },
    }),
  })
}
