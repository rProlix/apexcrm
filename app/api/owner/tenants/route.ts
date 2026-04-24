// app/api/owner/tenants/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/owner/tenants
 *
 * Returns all registered tenants with summary stats.
 * Access: platform owner only.
 */
export async function GET(_req: NextRequest) {
  // ── 1. Authenticate ────────────────────────────────────────────────────────
  const session = await createSessionServerClient()
  const { data: { user }, error: authErr } = await session.auth.getUser()

  if (authErr || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Authorise: owner only ────────────────────────────────────────────────
  const admin = getSupabaseServerClient()
  const { data: caller } = await admin
    .from('users')
    .select('role')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!caller || caller.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden — owner access required' }, { status: 403 })
  }

  // ── 3. Fetch tenants with lightweight aggregates ────────────────────────────
  const [
    { data: tenants, error: tenantErr },
    { data: moduleCounts },
    { data: userCounts },
  ] = await Promise.all([
    admin
      .from('tenants')
      .select('id, name, slug, subdomain, custom_domain, status, created_at, branding')
      .order('created_at', { ascending: false }),
    admin
      .from('tenant_modules')
      .select('tenant_id, enabled'),
    admin
      .from('users')
      .select('tenant_id')
      .not('tenant_id', 'is', null),
  ])

  if (tenantErr) {
    console.error('[GET /api/owner/tenants] error:', tenantErr.message)
    return NextResponse.json({ error: tenantErr.message }, { status: 500 })
  }

  // Build per-tenant enabled-module count map
  const enabledCountMap: Record<string, number> = {}
  for (const m of moduleCounts ?? []) {
    if (m.enabled && m.tenant_id) {
      enabledCountMap[m.tenant_id] = (enabledCountMap[m.tenant_id] ?? 0) + 1
    }
  }

  // Build per-tenant user count map
  const userCountMap: Record<string, number> = {}
  for (const u of userCounts ?? []) {
    if (u.tenant_id) {
      userCountMap[u.tenant_id] = (userCountMap[u.tenant_id] ?? 0) + 1
    }
  }

  const result = (tenants ?? []).map((t) => ({
    id:             t.id,
    name:           t.name,
    slug:           t.slug,
    subdomain:      t.subdomain,
    custom_domain:  t.custom_domain,
    status:         t.status,
    created_at:     t.created_at,
    branding:       t.branding,
    enabled_modules: enabledCountMap[t.id] ?? 0,
    staff_count:    userCountMap[t.id]  ?? 0,
  }))

  return NextResponse.json({ tenants: result })
}
