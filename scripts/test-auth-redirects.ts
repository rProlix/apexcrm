/**
 * scripts/test-auth-redirects.ts
 *
 * Verifies that the auth redirect helpers produce the correct URLs.
 * Run with:
 *   npx tsx scripts/test-auth-redirects.ts
 *
 * No test framework required — exits with code 1 if any assertion fails.
 */

// ── Bootstrap env for the script (mirrors .env.local defaults) ────────────────
// Set defaults only — don't reassign read-only properties in TypeScript strict mode
if (!process.env['NEXT_PUBLIC_APP_URL'])    process.env['NEXT_PUBLIC_APP_URL']    = 'https://nexoranow.com'
if (!process.env['NEXT_PUBLIC_ROOT_DOMAIN']) process.env['NEXT_PUBLIC_ROOT_DOMAIN'] = 'nexoranow.com'

// ── Import helpers ─────────────────────────────────────────────────────────────
// We import directly so this script works without a full Next.js build.
import {
  sanitizeNextPath,
  getRequestOrigin,
  getStorefrontEmailRedirectTo,
  getCrmEmailRedirectTo,
  isMainCrmHost,
  getStorefrontEmailRedirectToFromHeaders,
} from '../lib/auth/redirects'

// ── Tiny assertion helper ──────────────────────────────────────────────────────
let passed = 0
let failed = 0

function assert(label: string, actual: string, expected: string) {
  if (actual === expected) {
    console.log(`  ✓  ${label}`)
    passed++
  } else {
    console.error(`  ✗  ${label}`)
    console.error(`       expected: ${expected}`)
    console.error(`       actual:   ${actual}`)
    failed++
  }
}

// ── Helper: build a minimal Request ───────────────────────────────────────────
function makeRequest(url: string, headers?: Record<string, string>): Request {
  return new Request(url, { headers })
}

// ── Helper: build a minimal HeaderLike ────────────────────────────────────────
function makeHeaders(map: Record<string, string>) {
  return { get: (k: string) => map[k] ?? null }
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ sanitizeNextPath')

assert('valid path returned as-is',            sanitizeNextPath('/account'),    '/account')
assert('valid path with sub-route',            sanitizeNextPath('/account/orders'), '/account/orders')
assert('empty string → fallback',              sanitizeNextPath('',  '/account'), '/account')
assert('null → fallback',                      sanitizeNextPath(null, '/account'), '/account')
assert('absolute URL rejected → fallback',     sanitizeNextPath('https://evil.com', '/account'), '/account')
assert('protocol-relative rejected → fallback', sanitizeNextPath('//evil.com', '/account'), '/account')
assert('custom fallback used',                 sanitizeNextPath(null, '/dashboard'), '/dashboard')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ getRequestOrigin')

assert(
  'subdomain request → subdomain origin',
  getRequestOrigin(makeRequest('https://erickvcontacf.nexoranow.com/api/storefront/auth/signup')),
  'https://erickvcontacf.nexoranow.com',
)

assert(
  'main domain request → main domain origin',
  getRequestOrigin(makeRequest('https://nexoranow.com/api/storefront/auth/signup')),
  'https://nexoranow.com',
)

assert(
  'custom domain request → custom domain origin',
  getRequestOrigin(makeRequest('https://custombiz.com/api/storefront/auth/signup')),
  'https://custombiz.com',
)

assert(
  'localhost → http origin',
  getRequestOrigin(makeRequest('http://localhost:3000/api/storefront/auth/signup')),
  'http://localhost:3000',
)

assert(
  'x-forwarded-host takes priority over url.host',
  getRequestOrigin(makeRequest(
    'https://nexoranow.com/api/storefront/auth/signup',
    { 'x-forwarded-host': 'erickvcontacf.nexoranow.com' },
  )),
  'https://erickvcontacf.nexoranow.com',
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ getStorefrontEmailRedirectTo')

assert(
  'subdomain → storefront callback URL',
  getStorefrontEmailRedirectTo(
    makeRequest('https://erickvcontacf.nexoranow.com/api/storefront/auth/signup'),
    '/account',
  ),
  'https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount',
)

assert(
  'custom domain → custom domain callback URL',
  getStorefrontEmailRedirectTo(
    makeRequest('https://custombiz.com/api/storefront/auth/signup'),
    '/account',
  ),
  'https://custombiz.com/auth/callback?next=%2Faccount',
)

assert(
  'open redirect in next rejected → /account fallback',
  getStorefrontEmailRedirectTo(
    makeRequest('https://erickvcontacf.nexoranow.com/api/storefront/auth/signup'),
    'https://evil.com',
  ),
  'https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount',
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ getCrmEmailRedirectTo')

assert(
  'CRM signup → nexoranow.com/auth/callback?next=/dashboard',
  getCrmEmailRedirectTo('/dashboard'),
  'https://nexoranow.com/auth/callback?next=%2Fdashboard',
)

assert(
  'custom next path',
  getCrmEmailRedirectTo('/onboarding'),
  'https://nexoranow.com/auth/callback?next=%2Fonboarding',
)

assert(
  'open redirect in next rejected',
  getCrmEmailRedirectTo('https://evil.com'),
  'https://nexoranow.com/auth/callback?next=%2Fdashboard',
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ isMainCrmHost')

assert('nexoranow.com is main',    String(isMainCrmHost('nexoranow.com')),                   'true')
assert('subdomain is NOT main',    String(isMainCrmHost('erickvcontacf.nexoranow.com')),     'false')
assert('localhost is main (dev)',   String(isMainCrmHost('localhost')),                       'true')
assert('vercel preview is main',   String(isMainCrmHost('myapp-abc123.vercel.app')),         'true')
assert('custom domain is NOT main', String(isMainCrmHost('custombiz.com')),                  'false')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ getStorefrontEmailRedirectToFromHeaders (server action path)')

assert(
  'x-original-host used for subdomain',
  getStorefrontEmailRedirectToFromHeaders(
    makeHeaders({ 'x-original-host': 'erickvcontacf.nexoranow.com' }),
    '/account',
    'tenant-uuid-123',
  ),
  'https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount&tenant_id=tenant-uuid-123',
)

assert(
  'host fallback when x-original-host absent',
  getStorefrontEmailRedirectToFromHeaders(
    makeHeaders({ host: 'erickvcontacf.nexoranow.com' }),
    '/account',
  ),
  'https://erickvcontacf.nexoranow.com/auth/callback?next=%2Faccount',
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n▶ Key acceptance criteria')

const storefrontReq = makeRequest('https://erickvcontacf.nexoranow.com/api/storefront/auth/signup')
const storefrontUrl = getStorefrontEmailRedirectTo(storefrontReq, '/account')
const storefrontOk  = storefrontUrl.startsWith('https://erickvcontacf.nexoranow.com') &&
                      storefrontUrl.includes('/auth/callback') &&
                      storefrontUrl.includes('next=%2Faccount')

assert(
  'storefront confirmation email DOES NOT link to nexoranow.com',
  String(!storefrontUrl.startsWith('https://nexoranow.com')),
  'true',
)

assert(
  'storefront confirmation email links to the SUBDOMAIN',
  String(storefrontOk),
  'true',
)

assert(
  'CRM confirmation email links to nexoranow.com (not a subdomain)',
  String(getCrmEmailRedirectTo('/dashboard').startsWith('https://nexoranow.com')),
  'true',
)

// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.error('\n✗ Some tests failed. Fix the issues above.\n')
  process.exit(1)
} else {
  console.log('\n✓ All tests passed.\n')
}
