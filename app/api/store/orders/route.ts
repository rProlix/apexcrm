// app/api/store/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { applyOrderRewards } from '@/lib/rewards/applyOrderRewards'

// ─── GET /api/store/orders ────────────────────────────────────────────────────
// admin/owner → all orders for their tenant
// customer   → only their own orders
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient()

  // Try dashboard user first
  const dashUser = await resolveStoreUser(req)

  if (dashUser && (dashUser.role === 'admin' || dashUser.role === 'owner')) {
    const tenantId = dashUser.role === 'owner'
      ? (req.nextUrl.searchParams.get('tenant_id') ?? dashUser.tenant_id)
      : dashUser.tenant_id

    const { data, error } = await supabase
      .from('orders')
      .select('*, order_items(*)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[GET /api/store/orders] admin', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ orders: data })
  }

  // Try customer
  const customer = await resolveStoreCustomer(req)
  if (!customer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('tenant_id', customer.tenant_id)
    .eq('customer_id', customer.customer_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/store/orders] customer', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ orders: data })
}

// ─── POST /api/store/orders ───────────────────────────────────────────────────
// customer only — place an order
// Body: { items: Array<{ product_id: string; quantity: number }> }
export async function POST(req: NextRequest) {
  const customer = await resolveStoreCustomer(req)
  if (!customer) {
    return NextResponse.json({ error: 'Unauthorized — customer login required' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const items = body.items as Array<{ product_id: string; quantity: number }> | undefined

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array is required and must not be empty' }, { status: 400 })
  }

  for (const item of items) {
    if (typeof item.product_id !== 'string' || !item.product_id) {
      return NextResponse.json({ error: 'Each item must have a valid product_id' }, { status: 400 })
    }
    if (typeof item.quantity !== 'number' || item.quantity < 1) {
      return NextResponse.json({ error: 'Each item must have quantity >= 1' }, { status: 400 })
    }
  }

  const supabase = getSupabaseServerClient()
  const productIds = items.map((i) => i.product_id)

  // Fetch products — must belong to this tenant and be active
  const { data: products, error: productErr } = await supabase
    .from('products')
    .select('id, name, price, inventory_count, is_active, tenant_id')
    .in('id', productIds)
    .eq('tenant_id', customer.tenant_id)
    .eq('is_active', true)

  if (productErr) {
    console.error('[POST /api/store/orders] product fetch', productErr.message)
    return NextResponse.json({ error: productErr.message }, { status: 500 })
  }

  if (!products || products.length !== productIds.length) {
    return NextResponse.json(
      { error: 'One or more products not found or unavailable for this store' },
      { status: 400 }
    )
  }

  // Check inventory
  const productMap = new Map(products.map((p) => [p.id, p]))
  for (const item of items) {
    const product = productMap.get(item.product_id)!
    if (product.inventory_count < item.quantity) {
      return NextResponse.json(
        { error: `Insufficient stock for "${product.name}"` },
        { status: 400 }
      )
    }
  }

  // Calculate total
  const totalAmount = items.reduce((sum, item) => {
    return sum + Number(productMap.get(item.product_id)!.price) * item.quantity
  }, 0)

  // Insert order
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      tenant_id:    customer.tenant_id,
      customer_id:  customer.customer_id,
      status:       'pending',
      total_amount: totalAmount,
    })
    .select()
    .single()

  if (orderErr || !order) {
    console.error('[POST /api/store/orders] order insert', orderErr?.message)
    return NextResponse.json({ error: orderErr?.message ?? 'Order creation failed' }, { status: 500 })
  }

  // Insert order items
  const orderItems = items.map((item) => ({
    tenant_id:  customer.tenant_id,
    order_id:   order.id,
    product_id: item.product_id,
    quantity:   item.quantity,
    price:      Number(productMap.get(item.product_id)!.price),
  }))

  const { error: itemsErr } = await supabase.from('order_items').insert(orderItems)

  if (itemsErr) {
    console.error('[POST /api/store/orders] order_items insert', itemsErr.message)
    await supabase.from('orders').delete().eq('id', order.id)
    return NextResponse.json({ error: itemsErr.message }, { status: 500 })
  }

  // Decrement inventory atomically
  await Promise.all(
    items.map((item) =>
      supabase
        .rpc('decrement_product_inventory', {
          p_product_id: item.product_id,
          p_quantity:   item.quantity,
        })
        .then(({ error: rpcErr }) => {
          if (rpcErr) {
            console.warn('[POST /api/store/orders] inventory decrement failed for', item.product_id, rpcErr.message)
          }
        })
    )
  )

  // ── Apply rewards (non-blocking — never fails the order) ─────────────────
  applyOrderRewards({
    tenantId:   customer.tenant_id,
    customerId: customer.customer_id,
    orderId:    order.id,
    items:      items.map((item) => ({
      product_id: item.product_id,
      quantity:   item.quantity,
      price:      Number(productMap.get(item.product_id)!.price),
    })),
  }).catch((err) => {
    console.warn('[POST /api/store/orders] rewards application failed', err)
  })

  return NextResponse.json({ order }, { status: 201 })
}
