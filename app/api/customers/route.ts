// app/api/customers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { getTenantCustomers } from '@/lib/customers/getTenantCustomers'
import { findOrCreateTenantCustomer } from '@/lib/customers/findOrCreateTenantCustomer'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// ─── GET /api/customers ───────────────────────────────────────────────────────
// admin/owner — list customers for their tenant
export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(ctx.role, 'view_customers')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const params   = req.nextUrl.searchParams
  const limit    = Math.min(Number(params.get('limit')  ?? 50), 100)
  const offset   = Number(params.get('offset') ?? 0)
  const status   = params.get('status')   ?? undefined
  const search   = params.get('search')   ?? undefined

  // Owner can pass an explicit tenant_id; admin is always their own tenant
  const tenantId = ctx.role === 'owner'
    ? (params.get('tenant_id') ?? ctx.tenant_id)
    : ctx.tenant_id

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

  const customers = await getTenantCustomers(tenantId, { limit, offset, status, search })
  return NextResponse.json({ customers })
}

// ─── POST /api/customers ──────────────────────────────────────────────────────
// admin/owner — create a new customer record for their tenant
export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission(ctx.role, 'manage_customers')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const tenantId = ctx.role === 'owner'
    ? (body.tenant_id as string | undefined ?? ctx.tenant_id)
    : ctx.tenant_id

  if (!tenantId) {
    return NextResponse.json({ error: 'tenant_id required' }, { status: 400 })
  }

  const name  = typeof body.name  === 'string' ? body.name.trim()  : undefined
  const email = typeof body.email === 'string' ? body.email.trim() : undefined
  const phone = typeof body.phone === 'string' ? body.phone.trim() : undefined

  if (!name && !email) {
    return NextResponse.json({ error: 'name or email is required' }, { status: 400 })
  }

  try {
    const result = await findOrCreateTenantCustomer({
      tenantId,
      name,
      email,
      phone,
      metadata: (body.metadata as Record<string, unknown> | undefined) ?? {},
    })

    // Fetch full record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = getSupabaseServerClient() as any
    const { data: customer } = await supabase
      .from('customers')
      .select('*')
      .eq('id', result.customerId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    return NextResponse.json({ customer, created: result.created }, {
      status: result.created ? 201 : 200,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[POST /api/customers]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
