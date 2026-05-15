// app/api/pos/orders/[id]/refund/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { applyPOSInventoryMovements } from '@/lib/pos/applyPOSInventoryMovements'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner','manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: orderId } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getPOSClient()

  const { data: order } = await supabase
    .from('pos_orders')
    .select('id, status, payment_status, total_cents, amount_paid_cents')
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (!['paid','partially_paid','completed'].includes(order.payment_status)) {
    return NextResponse.json({ error: 'Order has no payments to refund' }, { status: 400 })
  }

  const amountCents = typeof body.amount_cents === 'number' ? body.amount_cents : order.amount_paid_cents
  const reason      = (body.reason as string) ?? 'Customer refund'
  const paymentId   = (body.payment_id as string) ?? null

  if (amountCents <= 0) return NextResponse.json({ error: 'Refund amount must be positive' }, { status: 400 })
  if (amountCents > order.amount_paid_cents) {
    return NextResponse.json({ error: 'Refund exceeds amount paid' }, { status: 400 })
  }

  const { data: refund, error: refErr } = await supabase
    .from('pos_refunds')
    .insert({
      tenant_id:   user.tenant_id,
      order_id:    orderId,
      payment_id:  paymentId,
      amount_cents: amountCents,
      reason,
      status:      'completed',
      created_by:  user.id,
    })
    .select('id, amount_cents, status')
    .single()

  if (refErr) return NextResponse.json({ error: refErr.message }, { status: 500 })

  const fullyRefunded = amountCents >= order.amount_paid_cents
  await supabase.from('pos_orders').update({
    payment_status: fullyRefunded ? 'refunded' : 'partially_refunded',
    status:         fullyRefunded ? 'refunded' : order.status,
    refunded_at:    fullyRefunded ? new Date().toISOString() : null,
    amount_paid_cents: Math.max(0, order.amount_paid_cents - amountCents),
  }).eq('id', orderId).eq('tenant_id', user.tenant_id)

  await supabase.from('pos_order_events').insert({
    tenant_id: user.tenant_id, order_id: orderId,
    event_type: 'refunded',
    message:    `Refund of $${(amountCents / 100).toFixed(2)}: ${reason}`,
    created_by: user.id,
  })

  // Reverse inventory
  applyPOSInventoryMovements({
    orderId, tenantId: user.tenant_id,
    trigger: 'payment_completed', reverse: true,
  }).catch(console.warn)

  return NextResponse.json({ refund })
}
