// app/api/admin/toggle-module/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * POST /api/admin/toggle-module
 *
 * Body: { tenant_id: string; module_key: string; enabled: boolean }
 *
 * Only callable by the platform owner (role === 'owner').
 * All other callers receive 403 Forbidden.
 * Role is always verified server-side — never trust client input.
 */
export async function POST(req: NextRequest) {
  // ── 1. Authenticate ─────────────────────────────────────────────────
  const sessionClient = createSessionServerClient()
  const { data: { user }, error: authError } = await sessionClient.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Authorise: must be platform owner ─────────────────────────────
  const admin = getSupabaseServerClient()
  const { data: userRecord } = await admin
    .from('users')
    .select('role')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!userRecord || userRecord.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // ── 3. Parse + validate body ──────────────────────────────────────────
  let body: { tenant_id?: unknown; module_key?: unknown; enabled?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { tenant_id, module_key, enabled } = body

  if (
    typeof tenant_id  !== 'string' || !tenant_id  ||
    typeof module_key !== 'string' || !module_key ||
    typeof enabled    !== 'boolean'
  ) {
    return NextResponse.json(
      { error: 'tenant_id (string), module_key (string) and enabled (boolean) are required' },
      { status: 400 }
    )
  }

  // ── 4. Verify the tenant exists ───────────────────────────────────────
  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenant_id)
    .maybeSingle()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  // ── 5. Upsert the module record ───────────────────────────────────────
  const { error: upsertError } = await admin
    .from('tenant_modules')
    .upsert(
      { tenant_id, module_key, enabled, config: {} },
      { onConflict: 'tenant_id,module_key' }
    )

  if (upsertError) {
    console.error('[toggle-module] upsert error:', upsertError.message)
    return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, tenant_id, module_key, enabled })
}
