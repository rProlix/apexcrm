// app/api/owner/diagnostics/auth-redirects/route.ts
//
// GET /api/owner/diagnostics/auth-redirects
//
// Returns a JSON object showing the auth redirect configuration for the
// current request. Useful for diagnosing why emailRedirectTo might be wrong.
//
// Requires: owner or admin role (checked via getUserContext).
// Does NOT expose secrets (service role key is never included).

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import {
  getRequestOrigin,
  getStorefrontEmailRedirectTo,
  getCrmEmailRedirectTo,
  isMainCrmHost,
} from '@/lib/auth/redirects'

export async function GET(request: NextRequest) {
  // Only allow authenticated owners / admins
  const ctx = await getUserContext()
  if (!ctx) {
    return NextResponse.json({ ok: false, error: 'Authentication required.' }, { status: 401 })
  }
  if (ctx.role !== 'owner' && ctx.role !== 'admin') {
    return NextResponse.json({ ok: false, error: 'Owner or admin role required.' }, { status: 403 })
  }

  const requestUrl = new URL(request.url)
  const hostname   = requestUrl.hostname

  const resolvedOrigin       = getRequestOrigin(request)
  const sampleStorefront     = getStorefrontEmailRedirectTo(request, '/account')
  const sampleCrm            = getCrmEmailRedirectTo('/dashboard')
  const onMainDomain         = isMainCrmHost(hostname)
  const storefrontMatchesCrm = sampleStorefront.startsWith(
    (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nexoranow.com').replace(/\/$/, ''),
  )

  return NextResponse.json({
    ok:   true,
    env: {
      NEXT_PUBLIC_APP_URL:    process.env.NEXT_PUBLIC_APP_URL   ?? '(not set)',
      APP_URL:                process.env.APP_URL               ?? '(not set)',
      NEXT_PUBLIC_ROOT_DOMAIN: process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '(not set)',
      NODE_ENV:               process.env.NODE_ENV              ?? '(not set)',
    },
    request: {
      host:          request.headers.get('host')              ?? '(not set)',
      xForwardedHost: request.headers.get('x-forwarded-host') ?? '(not set)',
      xOriginalHost: request.headers.get('x-original-host')  ?? '(not set)',
      resolvedOrigin,
      isMainDomain:  onMainDomain,
    },
    samples: {
      storefrontEmailRedirectTo: sampleStorefront,
      crmEmailRedirectTo:        sampleCrm,
    },
    warnings: [
      ...(storefrontMatchesCrm && !onMainDomain
        ? [`⚠ storefrontEmailRedirectTo resolves to the main CRM domain even though the request host is "${hostname}". The x-forwarded-host / x-original-host headers are likely missing or incorrect. Check middleware configuration.`]
        : []),
      ...(onMainDomain
        ? [`ℹ Request is on the main CRM domain — storefront sample uses the CRM origin (expected).`]
        : []),
    ],
  })
}
