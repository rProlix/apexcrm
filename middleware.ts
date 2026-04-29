// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'

export function middleware(req: NextRequest) {
  const url  = req.nextUrl.clone()
  const host = req.headers.get('host') ?? ''

  // Strip port number (e.g. localhost:3000 → localhost)
  const hostname = host.split(':')[0].toLowerCase()

  // ── Platform root domains — pass through unchanged ────────────────────────
  if (
    hostname === ROOT_DOMAIN ||
    hostname === `www.${ROOT_DOMAIN}` ||
    hostname === `app.${ROOT_DOMAIN}` ||
    hostname === 'localhost'
  ) {
    return NextResponse.next()
  }

  // ── Vercel preview / deployment URLs — pass through ───────────────────────
  if (hostname.endsWith('.vercel.app')) {
    return NextResponse.next()
  }

  // ── Tenant subdomain: {slug}.ROOT_DOMAIN or {slug}.localhost ─────────────
  const parts = hostname.split('.')

  // *.ROOT_DOMAIN  (e.g. acme.nexoranow.com → parts.length === 3)
  // *.localhost    (e.g. acme.localhost      → parts.length === 2)
  const isSubdomain =
    (parts.length === 3 && hostname.endsWith(`.${ROOT_DOMAIN}`)) ||
    (parts.length === 2 && hostname.endsWith('.localhost'))

  if (isSubdomain) {
    const subdomain = parts[0]
    url.pathname = `/sites/${subdomain}${url.pathname === '/' ? '' : url.pathname}`
    return NextResponse.rewrite(url)
  }

  // ── Custom / unknown domain — pass through (page handles DB lookup) ───────
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next|api|favicon.ico|.*\\..*).*)', '/'],
}
