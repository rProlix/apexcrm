// app/api/pos/orders/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

type Params = { params: Promise<{ id: string }> }

// ── GET /api/pos/orders/[id] ──────────────────────────────────────────────────
export async function GET(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = getPOSClient()

  const { data: order, error } = await supabase
    .from('pos_orders')
    .select(`
      *,
      customers(name,email,phone),
      pos_order_items(*, pos_order_item_modifiers(*)),
      pos_payments(*),
      pos_order_events(*),
      pos_refunds(*)
    `)
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  return NextResponse.json({ order })
}

// ── PATCH /api/pos/orders/[id] ────────────────────────────────────────────────
export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const allowed = [
    'order_type','status','table_name','guest_count','notes',
    'internal_notes','kitchen_notes','customer_id','customer_account_id',
    'subtotal_cents','discount_cents','tax_cents','tip_cents',
    'service_fee_cents','total_cents','balance_due_cents',
    'fulfillment_status','assigned_employee_id',
  ]

  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_orders')
    .update(update)
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .select('id, status, payment_status, total_cents, balance_due_cents')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (update.status) {
    await supabase.from('pos_order_events').insert({
      tenant_id: user.tenant_id, order_id: id,
      event_type: 'status_changed',
      message: `Status changed to ${update.status}`,
      created_by: user.id,
    })
  }

  return NextResponse.json({ order: data })
}
