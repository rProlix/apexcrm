// app/api/pos/orders/[id]/payments/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { applyPOSInventoryMovements } from '@/lib/pos/applyPOSInventoryMovements'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getPOSClient()

  const { data: order } = await supabase
    .from('pos_orders')
    .select('id, status, total_cents, amount_paid_cents, balance_due_cents, payment_status')
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (order.status === 'cancelled') return NextResponse.json({ error: 'Cannot pay cancelled order' }, { status: 400 })
  if (order.payment_status === 'paid') return NextResponse.json({ error: 'Order already paid' }, { status: 400 })

  const amountCents    = typeof body.amount_cents === 'number' ? body.amount_cents : 0
  const tipCents       = typeof body.tip_cents === 'number' ? body.tip_cents : 0
  const paymentMethod  = (body.payment_method as string) ?? 'cash'
  const provider       = (body.payment_provider as string) ?? (paymentMethod === 'cash' ? 'cash' : 'manual')

  if (amountCents <= 0) return NextResponse.json({ error: 'amount_cents must be positive' }, { status: 400 })

  // For Stripe/Square, a provider_payment_id is expected to be passed from client
  // (client creates payment intent, passes confirmation here)
  const providerPaymentId = (body.provider_payment_id as string) ?? null

  const { data: payment, error: payErr } = await supabase
    .from('pos_payments')
    .insert({
      tenant_id:           user.tenant_id,
      order_id:            orderId,
      payment_provider:    provider,
      payment_method:      paymentMethod,
      status:              'paid',
      amount_cents:        amountCents,
      tip_cents:           tipCents,
      provider_payment_id: providerPaymentId,
      collected_by:        user.id,
      paid_at:             new Date().toISOString(),
    })
    .select('id, amount_cents, payment_method, status')
    .single()

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

  // Update order totals
  const newPaid    = order.amount_paid_cents + amountCents + tipCents
  const newBalance = Math.max(0, order.total_cents - newPaid)
  const newTip     = (order.tip_cents ?? 0) + tipCents
  const fullyPaid  = newBalance <= 0

  await supabase.from('pos_orders').update({
    amount_paid_cents: newPaid,
    balance_due_cents: newBalance,
    tip_cents:         newTip,
    payment_status:    fullyPaid ? 'paid' : 'partially_paid',
    status:            fullyPaid && order.status === 'open' ? 'completed' : order.status,
    completed_at:      fullyPaid ? new Date().toISOString() : null,
  }).eq('id', orderId).eq('tenant_id', user.tenant_id)

  await supabase.from('pos_order_events').insert({
    tenant_id: user.tenant_id, order_id: orderId,
    event_type: 'payment_collected',
    message: `Payment of $${(amountCents / 100).toFixed(2)} collected via ${paymentMethod}`,
    created_by: user.id,
    metadata: { amount_cents: amountCents, payment_method: paymentMethod },
  })

  // Inventory deduction on payment
  if (fullyPaid) {
    applyPOSInventoryMovements({ orderId, tenantId: user.tenant_id, trigger: 'payment_completed' }).catch(console.warn)
  }

  return NextResponse.json({
    payment,
    order_summary: {
      amount_paid_cents: newPaid,
      balance_due_cents: newBalance,
      payment_status:    fullyPaid ? 'paid' : 'partially_paid',
      change_due_cents:  fullyPaid ? Math.max(0, amountCents - (order.balance_due_cents)) : 0,
    }
  })
}
