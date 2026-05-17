// app/api/storefront/auth/signup/route.ts
//
// Server-side signup endpoint for CUSTOMER storefront accounts.
//
// Why an API route instead of a server action?
//   Server actions run in the same Next.js worker as the page but the `host`
//   header can be ambiguous in some Vercel/proxy configurations.
//   In an API route handler, `request.url` is the definitive, unambiguous URL
//   that the browser actually requested — including the exact subdomain or
//   custom domain. `new URL(request.url).origin` is therefore guaranteed to
//   reflect the storefront the customer is visiting.
//
// Flow:
//   1. CustomerSignupForm (client) POSTs JSON to /api/storefront/auth/signup
//   2. This route derives emailRedirectTo from request.url
//   3. Calls supabase.auth.signUp with emailRedirectTo set to the storefront origin
//   4. Creates / links customer + customer_accounts rows in DB
//   5. Returns JSON — form shows "Check your inbox" message
//
// emailRedirectTo will be:
//   https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount&tenant_id=...
//   NOT https://nexoranow.com

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import {
  createSessionServerClient,
  getSupabaseServerClient,
} from '@/lib/supabase/server'
import {
  getStorefrontEmailRedirectTo,
  sanitizeNextPath,
} from '@/lib/auth/redirects'

function err(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status })
}

export async function POST(request: NextRequest) {
  // ── Parse body ─────────────────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return err('Request body must be valid JSON.', 400)
  }

  const email    = typeof body.email    === 'string' ? body.email.trim().toLowerCase()  : ''
  const password = typeof body.password === 'string' ? body.password                    : ''
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
  // This is the KEY fix. We use request.url which is the actual URL the
  // browser sent to this API endpoint, e.g.:
  //   https://erickvcontacf.nexoranow.com/api/storefront/auth/signup
  //
  // getStorefrontEmailRedirectTo() calls getRequestOrigin() which reads
  // x-forwarded-host first, then host, then falls back to new URL(req.url).host.
  // The result is always the storefront origin.
  const emailRedirectTo = `${getRequestOrigin(request)}/auth/callback?next=${encodeURIComponent(next)}&tenant_id=${encodeURIComponent(tenantId)}`

  // ── Diagnostics log — never log passwords or tokens ────────────────────────
  console.info('[storefront-signup-redirect]', {
    email,
    tenantId,
    requestUrl:              request.url,
    host:                    request.headers.get('host'),
    forwardedHost:           request.headers.get('x-forwarded-host'),
    generatedEmailRedirectTo: emailRedirectTo,
  })

  // ── Supabase auth: create user ─────────────────────────────────────────────
  const sessionClient = await createSessionServerClient()
  const { data: signupData, error: signupError } = await sessionClient.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name:       fullName,
        role:            'customer',
        tenant_id:       tenantId,
        account_type:    'customer',
        signup_origin:   'storefront',
        storefront_host: new URL(request.url).host,
      },
      emailRedirectTo,
    },
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
    return err('Account link failed. Please try again.', 500)
  }

  // ── Response ───────────────────────────────────────────────────────────────
  if (signupData.session) {
    // Email confirmation disabled — user is already active.
    return NextResponse.json({
      ok:         true,
      confirmed:  true,
      next,
    })
  }

  return NextResponse.json({
    ok:      true,
    confirmed: false,
    message:
      'We sent a confirmation email to your inbox. Click the link to activate your account, then sign in.',
    // Only included in non-production for debugging:
    ...(process.env.NODE_ENV !== 'production' && {
      _debug: { emailRedirectTo },
    }),
  })
}

// Inline import of getRequestOrigin to avoid circular dependency issues
// (redirects.ts exports it but we need it here too)
function getRequestOrigin(req: Request): string {
  const url      = new URL(req.url)
  const host     =
    req.headers.get('x-forwarded-host') ||
    req.headers.get('host')             ||
    url.host

  const cleanHost  = host.split(':')[0]
  const isLocalhost = cleanHost === 'localhost' || cleanHost === '127.0.0.1' || cleanHost.endsWith('.localhost')
  const protocol   = isLocalhost ? 'http' : 'https'
  const port       = host.includes(':') ? `:${host.split(':')[1]}` : ''
  return `${protocol}://${cleanHost}${port}`
}
