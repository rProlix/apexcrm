// app/api/store/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'

// ─── GET /api/store/orders/[id] ───────────────────────────────────────────────
// admin/owner → full access (must match tenant)
// customer   → only if order.customer_id === their customer_id
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = getSupabaseServerClient()

  const { data: order, error: fetchErr } = await supabase
    .from('orders')
    .select('*, order_items(*, products(name, price))')
    .eq('id', params.id)
    .maybeSingle()

  if (fetchErr) {
    console.error('[GET /api/store/orders/:id]', fetchErr.message)
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!order) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  // Try admin/owner
  const dashUser = await resolveStoreUser(req)
  if (dashUser && (dashUser.role === 'admin' || dashUser.role === 'owner')) {
    if (dashUser.role !== 'owner' && order.tenant_id !== dashUser.tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    return NextResponse.json({ order })
  }

  // Try customer
  const customer = await resolveStoreCustomer(req)
  if (!customer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (order.customer_id !== customer.customer_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ order })
}

// ─── PATCH /api/store/orders/[id] ────────────────────────────────────────────
// admin/owner only — update order status
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await resolveStoreUser(req)

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  const { data: existing } = await supabase
    .from('orders')
    .select('id, tenant_id')
    .eq('id', params.id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  }

  if (user.role !== 'owner' && existing.tenant_id !== user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded']
  if (body.status && !validStatuses.includes(body.status as string)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = {}
  if (body.status) updates.status = body.status

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('orders') as any)
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/store/orders/:id]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ order: data })
}
