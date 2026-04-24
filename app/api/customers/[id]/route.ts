// app/api/customers/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { getTenantCustomerById } from '@/lib/customers/getTenantCustomerById'
import { updateTenantCustomer } from '@/lib/customers/updateCustomerProfile'
import { getCustomerContext } from '@/lib/auth/customerGuard'
import { headers } from 'next/headers'

type Params = { params: { id: string } }

// ─── GET /api/customers/[id] ──────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = params

  // Try dashboard user first
  const ctx = await getUserContext()
  if (ctx && hasPermission(ctx.role, 'view_customers')) {
    const tenantId = ctx.tenant_id
    if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

    const customer = await getTenantCustomerById(tenantId, id)
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ customer })
  }

  // Try customer portal auth — customers can only view their own record
  const host = headers().get('host') ?? ''
  const customerCtx = await getCustomerContext(host)
  if (customerCtx && customerCtx.customer_id === id) {
    const customer = await getTenantCustomerById(customerCtx.tenant_id, id)
    if (!customer) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ customer })
  }

  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

// ─── PATCH /api/customers/[id] ────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = params
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(ctx.role, 'manage_customers')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = ctx.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed: Record<string, unknown> = {}
  const fields = ['name', 'email', 'phone', 'display_name', 'status', 'metadata'] as const
  for (const f of fields) {
    if (f in body) allowed[f] = body[f]
  }

  try {
    await updateTenantCustomer(tenantId, id, allowed as Parameters<typeof updateTenantCustomer>[2])
    const updated = await getTenantCustomerById(tenantId, id)
    return NextResponse.json({ customer: updated })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── DELETE /api/customers/[id] ───────────────────────────────────────────────
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = params
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(ctx.role, 'manage_customers')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = ctx.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = (await import('@/lib/supabase/server')).getSupabaseServerClient() as any
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
