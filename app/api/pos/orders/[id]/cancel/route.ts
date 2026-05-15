// app/api/pos/orders/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { applyPOSInventoryMovements } from '@/lib/pos/applyPOSInventoryMovements'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await params
  let body: Record<string, unknown> = {}
  try { body = await req.json() } catch { /* no body ok */ }

  const supabase = getPOSClient()

  const { data: order } = await supabase
    .from('pos_orders')
    .select('id, status')
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (['completed','cancelled','refunded'].includes(order.status)) {
    return NextResponse.json({ error: `Order already ${order.status}` }, { status: 400 })
  }

  await supabase.from('pos_orders')
    .update({
      status:             'cancelled',
      fulfillment_status: 'cancelled',
      cancelled_at:       new Date().toISOString(),
    })
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)

  await supabase.from('pos_order_events').insert({
    tenant_id:  user.tenant_id,
    order_id:   orderId,
    event_type: 'cancelled',
    message:    body.reason ? `Cancelled: ${body.reason}` : 'Order cancelled',
    created_by: user.id,
  })

  // Reverse inventory
  applyPOSInventoryMovements({
    orderId, tenantId: user.tenant_id,
    trigger: 'order_created', reverse: true,
  }).catch(console.warn)

  return NextResponse.json({ cancelled: true })
}
