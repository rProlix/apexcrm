// lib/tenant/resolveTenantByHost.ts
//
// Canonical tenant resolver for all host-based routing.
//
// Resolution order (per platform spec):
//  1. Normalize host — strip port
//  2. Verified custom domain  → tenant_domains.hostname (verified = true)
//  3. Platform subdomain      → *.yourcrm.com → tenants.slug = subdomain part
//  4. localhost dev fallback  → ?tenant=<slug> query param or null
//  5. Unrecognised host       → null (platform root / 404)

import { getSupabaseServerClient } from '@/lib/supabase/server'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'yourcrm.com'
const APP_URL     = process.env.NEXT_PUBLIC_APP_URL     ?? 'http://localhost:3000'

export interface ResolvedTenant {
  id:     string
  name:   string
  slug:   string
  status: string
}

/**
 * Resolves the tenant for a given HTTP Host header value.
 *
 * Supports:
 *  - `rentalco.yourcrm.com`          → by slug
 *  - `www.rentalco.com`              → by verified custom domain
 *  - `rentalco.localhost`            → by slug (local dev)
 *  - `localhost?tenant=rentalco`     → pass tenantSlug separately (local dev)
 *  - `localhost`                     → returns null (platform root)
 */
export async function resolveTenantByHost(
  host:       string,
  tenantSlug?: string | null,
): Promise<ResolvedTenant | null> {
  const hostname = normalizeHost(host)

  // Local dev on bare localhost → use explicit slug override if provided
  if (hostname === 'localhost') {
    if (!tenantSlug) return null
    return resolveTenantBySlug(tenantSlug)
  }

  // Platform root domain (e.g. yourcrm.com or app.yourcrm.com) → no tenant
  const appHostname = safeHostname(APP_URL)
  if (hostname === ROOT_DOMAIN || hostname === appHostname) return null

  let db: ReturnType<typeof getSupabaseServerClient>
  try {
    db = getSupabaseServerClient()
  } catch {
    return null
  }

  // 1. Verified custom domain
  const { data: domainRow } = await db
    .from('tenant_domains')
    .select('tenant_id')
    .eq('hostname', hostname)
    .eq('verified', true)
    .maybeSingle()

  if (domainRow?.tenant_id) {
    return fetchTenantById(db, domainRow.tenant_id)
  }

  // 2. Platform subdomain  →  {slug}.yourcrm.com  or  {slug}.localhost
  const subdomain = extractSubdomain(hostname, ROOT_DOMAIN)
  if (subdomain) {
    return resolveTenantBySlug(subdomain)
  }

  // 3. Unrecognised host (unverified custom domain, typo, etc.) → null
  return null
}

/**
 * Resolves a tenant directly by its slug.
 * Used for direct slug lookups without a host header (e.g., dashboard pages).
 */
export async function resolveTenantBySlug(slug: string): Promise<ResolvedTenant | null> {
  let db: ReturnType<typeof getSupabaseServerClient>
  try {
    db = getSupabaseServerClient()
  } catch {
    return null
  }
  const { data } = await db
    .from('tenants')
    .select('id, name, slug, status')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle()
  return data ?? null
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function fetchTenantById(
  db: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<ResolvedTenant | null> {
  const { data } = await db
    .from('tenants')
    .select('id, name, slug, status')
    .eq('id', tenantId)
    .eq('status', 'active')
    .maybeSingle()
  return data ?? null
}

function normalizeHost(host: string): string {
  return host.split(':')[0].toLowerCase().trim()
}

function extractSubdomain(hostname: string, rootDomain: string): string | null {
  // rentalco.localhost  (local dev)
  if (hostname.endsWith('.localhost')) {
    const sub = hostname.replace(/\.localhost$/, '')
    return sub || null
  }

  // rentalco.yourcrm.com  (production)
  const suffix = `.${rootDomain}`
  if (hostname.endsWith(suffix)) {
    const sub = hostname.slice(0, hostname.length - suffix.length)
    return sub || null
  }

  return null
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'localhost'
  }
}
