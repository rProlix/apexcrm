// app/api/pos/orders/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'
import { calculateOrder } from '@/lib/pos/calculateOrder'
import { applyPOSInventoryMovements } from '@/lib/pos/applyPOSInventoryMovements'
import type { CartItem, POSSettings } from '@/lib/pos/types'

// ── GET /api/pos/orders ────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const status  = searchParams.get('status') ?? ''
  const payment = searchParams.get('payment_status') ?? ''
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)
  const date    = searchParams.get('date') // 'today' | ISO date

  const supabase = getPOSClient()
  let query = supabase
    .from('pos_orders')
    .select(`*, customers(name,email,phone)`)
    .eq('tenant_id', user.tenant_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) query = query.eq('status', status)
  if (payment) query = query.eq('payment_status', payment)
  if (date === 'today') {
    const d = new Date(); d.setHours(0,0,0,0)
    query = query.gte('created_at', d.toISOString())
  } else if (date) {
    const d = new Date(date); d.setHours(0,0,0,0)
    const e = new Date(date); e.setHours(23,59,59,999)
    query = query.gte('created_at', d.toISOString()).lte('created_at', e.toISOString())
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const orders = (data ?? []).map((o: Record<string, unknown>) => {
    const customer = o.customers as { name?: string } | null
    return { ...o, customer_name: customer?.name ?? null, customers: undefined }
  })

  return NextResponse.json({ orders })
}

// ── POST /api/pos/orders ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const tenantId = user.tenant_id
  const supabase = getPOSClient()

  // Load settings
  const { data: settings } = await supabase
    .from('pos_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .maybeSingle() as { data: POSSettings | null }

  const safeSettings = settings ?? {
    default_tax_rate: 0, service_fee_enabled: false,
    service_fee_percent: 0, tips_enabled: true,
    inventory_deduction_timing: 'payment_completed',
  }

  const cartItems = (body.items as CartItem[] | undefined) ?? []
  const discount  = (body.discount as { type: 'percent' | 'fixed_amount'; value: number } | null) ?? null
  const tipCents  = typeof body.tip_cents === 'number' ? body.tip_cents : 0

  const calc = calculateOrder({
    items: cartItems,
    discount,
    tip_cents: tipCents,
    settings: safeSettings,
  })

  // Generate order number
  const { data: orderNum } = await supabase.rpc('pos_generate_order_number', { p_tenant_id: tenantId })
  const orderNumber = orderNum ?? `POS-${Date.now()}`

  // Insert order
  const { data: order, error: orderErr } = await supabase
    .from('pos_orders')
    .insert({
      tenant_id:          tenantId,
      order_number:       orderNumber,
      channel:            body.channel ?? 'pos',
      order_type:         body.order_type ?? 'in_person',
      status:             body.status ?? 'open',
      customer_id:        body.customer_id ?? null,
      customer_account_id: body.customer_account_id ?? null,
      register_id:        body.register_id ?? null,
      shift_id:           body.shift_id ?? null,
      table_name:         body.table_name ?? null,
      guest_count:        body.guest_count ?? null,
      cashier_user_id:    user.id,
      notes:              body.notes ?? null,
      kitchen_notes:      body.kitchen_notes ?? null,
      subtotal_cents:     calc.subtotal_cents,
      discount_cents:     calc.discount_cents,
      tax_cents:          calc.tax_cents,
      tip_cents:          calc.tip_cents,
      service_fee_cents:  calc.service_fee_cents,
      total_cents:        calc.total_cents,
      balance_due_cents:  calc.balance_due_cents,
      currency:           'USD',
      created_by:         user.id,
    })
    .select('id, order_number, total_cents, balance_due_cents')
    .single()

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 500 })

  // Insert order items with modifiers
  if (cartItems.length > 0) {
    const itemInserts = cartItems.map((item, idx) => {
      const itemCalc = calc.items[idx]
      return {
        tenant_id:            tenantId,
        order_id:             order.id,
        product_id:           item.product_id ?? null,
        name:                 item.name,
        item_type:            item.item_type ?? 'product',
        quantity:             item.quantity,
        unit_price_cents:     item.unit_price_cents,
        base_price_cents:     itemCalc.base_price_cents,
        modifier_total_cents: itemCalc.modifier_total_cents,
        tax_cents:            itemCalc.tax_cents,
        total_cents:          itemCalc.total_cents,
        taxable:              item.taxable ?? true,
        tax_rate:             item.tax_rate ?? null,
        notes:                item.notes || null,
        kitchen_notes:        item.kitchen_notes || null,
        sort_order:           idx,
      }
    })

    const { data: insertedItems, error: itemsErr } = await supabase
      .from('pos_order_items')
      .insert(itemInserts)
      .select('id')

    if (itemsErr) {
      console.error('[POS orders] item insert:', itemsErr.message)
    }

    // Insert modifiers
    const modifierInserts = (insertedItems ?? []).flatMap((insertedItem: { id: string }, idx: number) => {
      const cartItem = cartItems[idx]
      return (cartItem?.modifiers ?? []).map((mod) => ({
        tenant_id:          tenantId,
        order_item_id:      insertedItem.id,
        modifier_group_id:  mod.modifier_group_id,
        modifier_id:        mod.modifier_id,
        name:               mod.name,
        modifier_type:      mod.modifier_type,
        quantity:           mod.quantity,
        price_delta_cents:  mod.price_delta_cents,
        total_cents:        Math.round(mod.price_delta_cents * mod.quantity),
        inventory_item_id:  mod.inventory_item_id ?? null,
        affects_inventory:  mod.affects_inventory ?? false,
        quantity_delta:     mod.quantity_delta ?? 0,
      }))
    })

    if (modifierInserts.length > 0) {
      await supabase.from('pos_order_item_modifiers').insert(modifierInserts)
    }
  }

  // Log event
  await supabase.from('pos_order_events').insert({
    tenant_id: tenantId, order_id: order.id,
    event_type: 'order_created', message: `Order ${orderNumber} created`,
    created_by: user.id,
  })

  // Apply inventory if timing = order_created
  applyPOSInventoryMovements({ orderId: order.id, tenantId, trigger: 'order_created' }).catch(console.warn)

  return NextResponse.json({ order }, { status: 201 })
}
