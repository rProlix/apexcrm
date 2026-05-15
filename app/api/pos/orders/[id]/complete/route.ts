// app/api/pos/orders/[id]/complete/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { applyPOSInventoryMovements } from '@/lib/pos/applyPOSInventoryMovements'
import { applyOrderRewards } from '@/lib/rewards/applyOrderRewards'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await params
  const supabase = getPOSClient()

  const { data: order } = await supabase
    .from('pos_orders')
    .select('id, status, payment_status, customer_id, total_cents, tenant_id')
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'completed') return NextResponse.json({ error: 'Order already completed' }, { status: 400 })
  if (['cancelled','refunded'].includes(order.status)) {
    return NextResponse.json({ error: 'Cannot complete a cancelled or refunded order' }, { status: 400 })
  }

  await supabase.from('pos_orders')
    .update({
      status: 'completed',
      fulfillment_status: 'fulfilled',
      completed_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)

  await supabase.from('pos_order_items')
    .update({ fulfillment_status: 'fulfilled' })
    .eq('order_id', orderId)
    .eq('tenant_id', user.tenant_id)

  await supabase.from('pos_order_events').insert({
    tenant_id: user.tenant_id, order_id: orderId,
    event_type: 'completed', message: 'Order completed',
    created_by: user.id,
  })

  // Inventory deduction
  applyPOSInventoryMovements({ orderId, tenantId: user.tenant_id, trigger: 'order_completed' }).catch(console.warn)

  // Apply rewards if customer attached
  if (order.customer_id) {
    const { data: items } = await supabase
      .from('pos_order_items')
      .select('product_id, quantity, total_cents')
      .eq('order_id', orderId)
      .eq('tenant_id', user.tenant_id)

    if (items && items.length > 0) {
      applyOrderRewards({
        tenantId:   user.tenant_id,
        customerId: order.customer_id,
        orderId,
        items: (items as Array<{ product_id: string; quantity: number; total_cents: number }>).map((i) => ({
          product_id: i.product_id ?? '',
          quantity:   i.quantity,
          price:      i.total_cents / 100,
        })),
      }).catch(console.warn)
    }
  }

  return NextResponse.json({ completed: true })
}
