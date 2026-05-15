// app/api/pos/orders/[id]/items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

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

  // Verify order belongs to tenant and is editable
  const { data: order } = await supabase
    .from('pos_orders')
    .select('id, status, tenant_id')
    .eq('id', orderId)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
  if (['completed','cancelled','refunded'].includes(order.status)) {
    return NextResponse.json({ error: 'Cannot modify a closed order' }, { status: 400 })
  }

  const modifiers = Array.isArray(body.modifiers) ? body.modifiers : []
  const modTotal = modifiers.reduce((s: number, m: { price_delta_cents: number; quantity: number }) =>
    s + Math.round(m.price_delta_cents * m.quantity), 0)
  const unitPrice = typeof body.unit_price_cents === 'number' ? body.unit_price_cents : 0
  const qty = typeof body.quantity === 'number' ? body.quantity : 1
  const taxRate = (typeof body.tax_rate === 'number' ? body.tax_rate : 0) / 100
  const taxable = body.taxable !== false
  const unitWithMod = unitPrice + modTotal
  const subtotal = Math.round(unitWithMod * qty)
  const taxCents = taxable ? Math.round(subtotal * taxRate) : 0
  const totalCents = subtotal + taxCents

  const { data: item, error } = await supabase
    .from('pos_order_items')
    .insert({
      tenant_id:            user.tenant_id,
      order_id:             orderId,
      product_id:           body.product_id ?? null,
      name:                 body.name,
      item_type:            body.item_type ?? 'product',
      quantity:             qty,
      unit_price_cents:     unitPrice,
      base_price_cents:     unitPrice,
      modifier_total_cents: modTotal,
      tax_cents:            taxCents,
      total_cents:          totalCents,
      taxable,
      tax_rate:             body.tax_rate ?? null,
      notes:                body.notes ?? null,
      kitchen_notes:        body.kitchen_notes ?? null,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (modifiers.length > 0) {
    await supabase.from('pos_order_item_modifiers').insert(
      modifiers.map((m: Record<string, unknown>) => ({
        tenant_id:         user.tenant_id,
        order_item_id:     item.id,
        modifier_group_id: m.modifier_group_id ?? null,
        modifier_id:       m.modifier_id ?? null,
        name:              m.name,
        modifier_type:     m.modifier_type ?? 'addon',
        quantity:          m.quantity ?? 1,
        price_delta_cents: m.price_delta_cents ?? 0,
        total_cents:       Math.round(Number(m.price_delta_cents ?? 0) * Number(m.quantity ?? 1)),
        inventory_item_id: m.inventory_item_id ?? null,
        affects_inventory: m.affects_inventory ?? false,
        quantity_delta:    m.quantity_delta ?? 0,
      }))
    )
  }

  return NextResponse.json({ item }, { status: 201 })
}
