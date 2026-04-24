// app/api/rewards/apply-order/route.ts
// Called internally after a successful order is placed.
// Can be called server-side (from the orders route) or via authenticated POST.
// Requires admin/owner or an authenticated customer for their own order.
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'
import { applyOrderRewards } from '@/lib/rewards/applyOrderRewards'
import type { OrderItemForRewards } from '@/types/rewards'

// ─── POST /api/rewards/apply-order ────────────────────────────────────────────
// Body: {
//   tenant_id:   string  (required if called as admin/owner)
//   customer_id: string  (required if called as admin/owner)
//   order_id:    string
//   items:       Array<{ product_id, quantity, price }>
// }
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { order_id, items } = body

  if (typeof order_id !== 'string' || !order_id) {
    return NextResponse.json({ error: 'order_id is required' }, { status: 400 })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'items array is required' }, { status: 400 })
  }

  // Try admin/owner first (called from server-side order flow)
  const dashUser = await resolveStoreUser(req)
  if (dashUser && (dashUser.role === 'admin' || dashUser.role === 'owner')) {
    const tenantId   = typeof body.tenant_id   === 'string' ? body.tenant_id   : dashUser.tenant_id
    const customerId = typeof body.customer_id  === 'string' ? body.customer_id : ''

    if (!customerId) {
      return NextResponse.json({ error: 'customer_id is required for admin calls' }, { status: 400 })
    }

    const result = await applyOrderRewards({
      tenantId,
      customerId,
      orderId: order_id,
      items:   items as OrderItemForRewards[],
    })

    return NextResponse.json(result)
  }

  // Customer placing their own order
  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const result = await applyOrderRewards({
    tenantId:   customer.tenant_id,
    customerId: customer.customer_id,
    orderId:    order_id,
    items:      items as OrderItemForRewards[],
  })

  return NextResponse.json(result)
}
