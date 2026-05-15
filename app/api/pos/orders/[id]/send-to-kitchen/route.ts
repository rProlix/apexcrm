// app/api/pos/orders/[id]/send-to-kitchen/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { applyPOSInventoryMovements } from '@/lib/pos/applyPOSInventoryMovements'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await params
  const supabase = getPOSClient()

  const { data: order } = await supabase
    .from('pos_orders')
    .select('id, status, tenant_id')
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (['completed','cancelled'].includes(order.status)) {
    return NextResponse.json({ error: 'Order cannot be sent to kitchen' }, { status: 400 })
  }

  // Create kitchen ticket
  const { data: ticket, error: ticketErr } = await supabase
    .from('pos_kitchen_tickets')
    .insert({
      tenant_id: user.tenant_id,
      order_id:  orderId,
      status:    'new',
      sent_at:   new Date().toISOString(),
    })
    .select('id')
    .single()

  if (ticketErr) return NextResponse.json({ error: ticketErr.message }, { status: 500 })

  // Update order and items status
  await supabase.from('pos_orders').update({ status: 'sent_to_kitchen', fulfillment_status: 'preparing' })
    .eq('id', orderId).eq('tenant_id', user.tenant_id)

  await supabase.from('pos_order_items')
    .update({ fulfillment_status: 'sent_to_kitchen' })
    .eq('order_id', orderId)
    .eq('tenant_id', user.tenant_id)
    .in('fulfillment_status', ['not_started'])

  await supabase.from('pos_order_events').insert({
    tenant_id: user.tenant_id, order_id: orderId,
    event_type: 'sent_to_kitchen', message: 'Order sent to kitchen',
    created_by: user.id,
  })

  applyPOSInventoryMovements({ orderId, tenantId: user.tenant_id, trigger: 'sent_to_kitchen' }).catch(console.warn)

  return NextResponse.json({ ticket })
}
