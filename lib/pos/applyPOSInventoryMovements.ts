// lib/pos/applyPOSInventoryMovements.ts
// Deducts inventory when a POS order reaches the configured timing.
// Idempotent: uses pos_inventory_movements to track what has been deducted.

import { getPOSClient } from './supabasePOS'

interface POSInventoryInput {
  orderId:   string
  tenantId:  string
  trigger:   'order_created' | 'sent_to_kitchen' | 'payment_completed' | 'order_completed'
  reverse?:  boolean  // true = refund/cancel (reverse deductions)
}

export async function applyPOSInventoryMovements(input: POSInventoryInput): Promise<{
  applied: number
  skipped: number
  errors:  string[]
}> {
  const { orderId, tenantId, trigger, reverse = false } = input
  const supabase = getPOSClient()
  const errors: string[] = []
  let applied = 0
  let skipped = 0

  // Check POS settings for timing
  const { data: settings } = await supabase
    .from('pos_settings')
    .select('inventory_deduction_timing')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  const timing = settings?.inventory_deduction_timing ?? 'payment_completed'
  if (!reverse && timing !== trigger) return { applied: 0, skipped: 0, errors: [] }

  // Idempotency: check if already applied for this order+trigger
  if (!reverse) {
    const { data: existing } = await supabase
      .from('pos_inventory_movements')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('order_id', orderId)
      .eq('movement_type', 'sale')
      .limit(1)
    if (existing && existing.length > 0) return { applied: 0, skipped: 0, errors: [] }
  }

  // Fetch order items with product_id
  const { data: orderItems } = await supabase
    .from('pos_order_items')
    .select('id, product_id, quantity, name')
    .eq('order_id', orderId)
    .eq('tenant_id', tenantId)

  if (!orderItems || orderItems.length === 0) return { applied: 0, skipped: 0, errors: [] }

  for (const orderItem of orderItems) {
    if (!orderItem.product_id) { skipped++; continue }

    // 1. Deduct store product inventory_count
    const { data: product } = await supabase
      .from('products')
      .select('id, inventory_count')
      .eq('id', orderItem.product_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (product && product.inventory_count > 0) {
      const delta = reverse ? orderItem.quantity : -orderItem.quantity
      const newCount = Math.max(0, product.inventory_count + delta)
      await supabase
        .from('products')
        .update({ inventory_count: newCount })
        .eq('id', product.id)
        .eq('tenant_id', tenantId)
    }

    // 2. Deduct via inventory_recipes (ingredient-level deduction)
    const { data: recipes } = await supabase
      .from('inventory_recipes')
      .select('inventory_item_id, quantity_required, unit')
      .eq('tenant_id', tenantId)
      .eq('product_id', orderItem.product_id)

    for (const recipe of recipes ?? []) {
      const totalQty  = recipe.quantity_required * orderItem.quantity
      const delta     = reverse ? totalQty : -totalQty

      const { data: invItem } = await supabase
        .from('inventory_items')
        .select('id, current_quantity')
        .eq('id', recipe.inventory_item_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (!invItem) { skipped++; continue }

      const before = Number(invItem.current_quantity)
      const after  = before + delta

      const { error: updateErr } = await supabase
        .from('inventory_items')
        .update({ current_quantity: after })
        .eq('id', invItem.id)
        .eq('tenant_id', tenantId)

      if (updateErr) { errors.push(`Recipe deduction failed: ${updateErr.message}`); continue }

      // Record movement in inventory_movements
      await supabase
        .from('inventory_movements')
        .insert({
          tenant_id:          tenantId,
          inventory_item_id:  recipe.inventory_item_id,
          movement_type:      reverse ? 'return' : 'sale',
          quantity_delta:     delta,
          quantity_before:    before,
          quantity_after:     after,
          order_id:           orderId,
          product_id:         orderItem.product_id,
          source_type:        'pos_order',
          source_id:          orderId,
          reason:             `POS order ${orderId}`,
        })

      // Record in pos_inventory_movements
      await supabase
        .from('pos_inventory_movements')
        .insert({
          tenant_id:          tenantId,
          order_id:           orderId,
          order_item_id:      orderItem.id,
          inventory_item_id:  recipe.inventory_item_id,
          movement_type:      reverse ? 'refund' : 'sale',
          quantity_delta:     delta,
          unit:               recipe.unit,
          reason:             `POS ${reverse ? 'refund' : 'sale'} — ${orderItem.name}`,
        })

      applied++
    }

    // 3. Deduct via product_inventory_links (Inventory module integration)
    const { data: links } = await supabase
      .from('product_inventory_links')
      .select('inventory_item_id, quantity_per_product')
      .eq('tenant_id', tenantId)
      .eq('product_id', orderItem.product_id)
      .eq('deduct_on_sale', true)

    for (const link of links ?? []) {
      // Skip if already handled via recipes
      const alreadyHandled = (recipes ?? []).some((r: { inventory_item_id: string }) => r.inventory_item_id === link.inventory_item_id)
      if (alreadyHandled) continue

      const totalQty = link.quantity_per_product * orderItem.quantity
      const delta    = reverse ? totalQty : -totalQty

      const { data: invItem } = await supabase
        .from('inventory_items')
        .select('id, current_quantity')
        .eq('id', link.inventory_item_id)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (!invItem) continue

      const before = Number(invItem.current_quantity)
      const after  = before + delta

      await supabase
        .from('inventory_items')
        .update({ current_quantity: after })
        .eq('id', invItem.id)
        .eq('tenant_id', tenantId)

      await supabase
        .from('pos_inventory_movements')
        .insert({
          tenant_id:          tenantId,
          order_id:           orderId,
          order_item_id:      orderItem.id,
          inventory_item_id:  link.inventory_item_id,
          movement_type:      reverse ? 'refund' : 'sale',
          quantity_delta:     delta,
          reason:             `POS ${reverse ? 'refund' : 'sale'} via product link`,
        })

      applied++
    }
  }

  // 4. Deduct modifier inventory (if modifier affects_inventory)
  const { data: modifiers } = await supabase
    .from('pos_order_item_modifiers')
    .select('id, inventory_item_id, affects_inventory, quantity_delta, quantity')
    .eq('tenant_id', tenantId)
    .in('order_item_id', orderItems.map((i: { id: string }) => i.id))
    .eq('affects_inventory', true)

  for (const mod of modifiers ?? []) {
    if (!mod.inventory_item_id) continue
    const totalDelta = mod.quantity_delta * mod.quantity
    const delta = reverse ? totalDelta : -totalDelta

    const { data: invItem } = await supabase
      .from('inventory_items')
      .select('id, current_quantity')
      .eq('id', mod.inventory_item_id)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!invItem) continue
    const before = Number(invItem.current_quantity)
    const after  = before + delta

    await supabase
      .from('inventory_items')
      .update({ current_quantity: after })
      .eq('id', invItem.id)
      .eq('tenant_id', tenantId)

    await supabase
      .from('pos_inventory_movements')
      .insert({
        tenant_id:          tenantId,
        order_id:           orderId,
        modifier_id:        mod.id,
        inventory_item_id:  mod.inventory_item_id,
        movement_type:      reverse ? 'refund' : 'sale',
        quantity_delta:     delta,
        reason:             `POS modifier ${reverse ? 'refund' : 'sale'}`,
      })
    applied++
  }

  // Trigger alert recalculation if inventory module is enabled
  if (applied > 0) {
    supabase.rpc('recalculate_inventory_alerts', { p_tenant_id: tenantId }).catch(() => {/* silent */})
  }

  return { applied, skipped, errors }
}
