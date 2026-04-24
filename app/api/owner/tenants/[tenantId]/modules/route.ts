// app/api/owner/tenants/[tenantId]/modules/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { MODULE_REGISTRY } from '@/modules/registry'
import { getTenantModulesWithDefaults } from '@/lib/modules/getTenantModulesWithDefaults'

type RouteContext = { params: { tenantId: string } }

// ── Shared auth + owner guard ─────────────────────────────────────────────────
async function verifyOwner(): Promise<
  | { ok: true;  admin: ReturnType<typeof getSupabaseServerClient> }
  | { ok: false; response: NextResponse }
> {
  const session = await createSessionServerClient()
  const { data: { user }, error } = await session.auth.getUser()

  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const admin = getSupabaseServerClient()
  const { data: caller } = await admin
    .from('users')
    .select('role')
    .eq('auth_user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()

  if (!caller || caller.role !== 'owner') {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden — owner access required' }, { status: 403 }),
    }
  }

  return { ok: true, admin }
}

// ── Shared tenant existence check ─────────────────────────────────────────────
async function verifyTenant(
  admin: ReturnType<typeof getSupabaseServerClient>,
  tenantId: string,
): Promise<NextResponse | null> {
  if (!tenantId || !/^[0-9a-f-]{36}$/i.test(tenantId)) {
    return NextResponse.json({ error: 'Invalid tenant ID format' }, { status: 400 })
  }

  const { data: tenant } = await admin
    .from('tenants')
    .select('id')
    .eq('id', tenantId)
    .maybeSingle()

  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  return null
}

/**
 * GET /api/owner/tenants/[tenantId]/modules
 *
 * Returns all modules in the registry merged with the tenant's DB records.
 * Modules not in the DB fall back to DEFAULT_MODULE_STATES.
 */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const auth = await verifyOwner()
  if (!auth.ok) return auth.response

  const tenantErr = await verifyTenant(auth.admin, params.tenantId)
  if (tenantErr) return tenantErr

  const modules = await getTenantModulesWithDefaults(params.tenantId)

  return NextResponse.json({ modules })
}

/**
 * POST /api/owner/tenants/[tenantId]/modules
 *
 * Body: { module_key: string; is_enabled: boolean }
 *
 * Upserts the enabled state for the module. Validates:
 *  - tenantId exists
 *  - module_key is registered in MODULE_REGISTRY
 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const auth = await verifyOwner()
  if (!auth.ok) return auth.response

  const tenantErr = await verifyTenant(auth.admin, params.tenantId)
  if (tenantErr) return tenantErr

  // Parse body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { module_key, is_enabled } = body

  if (typeof module_key !== 'string' || !module_key) {
    return NextResponse.json({ error: 'module_key (string) is required' }, { status: 400 })
  }

  if (typeof is_enabled !== 'boolean') {
    return NextResponse.json({ error: 'is_enabled (boolean) is required' }, { status: 400 })
  }

  // Validate module_key exists in registry
  if (!(module_key in MODULE_REGISTRY)) {
    return NextResponse.json(
      {
        error:            `Unknown module key: '${module_key}'`,
        registered_keys:  Object.keys(MODULE_REGISTRY),
      },
      { status: 400 }
    )
  }

  // Upsert — eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {
    tenant_id:  params.tenantId,
    module_key,
    enabled:    is_enabled,
    config:     {},
    updated_at: new Date().toISOString(),
  }

  const { error: upsertErr } = await auth.admin
    .from('tenant_modules')
    .upsert(payload, { onConflict: 'tenant_id,module_key' })

  if (upsertErr) {
    console.error('[POST /api/owner/.../modules] upsert error:', upsertErr.message)
    return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success:    true,
    tenant_id:  params.tenantId,
    module_key,
    is_enabled,
  })
}
