// app/api/pos/orders/[id]/items/[itemId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

type Params = { params: Promise<{ id: string; itemId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId, itemId } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase = getPOSClient()

  const allowed = ['quantity','notes','kitchen_notes','fulfillment_status','unit_price_cents']
  const update: Record<string, unknown> = {}
  for (const k of allowed) {
    if (k in body) update[k] = body[k]
  }

  if (typeof update.quantity === 'number' && typeof update.unit_price_cents === 'number') {
    update.total_cents = Math.round(Number(update.quantity) * Number(update.unit_price_cents))
  }

  const { data, error } = await supabase
    .from('pos_order_items')
    .update(update)
    .eq('id', itemId)
    .eq('order_id', orderId)
    .eq('tenant_id', user.tenant_id)
    .select('id,quantity,total_cents')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: orderId, itemId } = await params
  const supabase = getPOSClient()

  const { error } = await supabase
    .from('pos_order_items')
    .delete()
    .eq('id', itemId)
    .eq('order_id', orderId)
    .eq('tenant_id', user.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
