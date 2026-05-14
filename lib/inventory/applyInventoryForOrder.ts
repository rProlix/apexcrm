// lib/inventory/applyInventoryForOrder.ts
// Service function that deducts inventory when a store order is completed.
// Call this from the order payment/completion flow.
// Idempotent: uses source_id = orderId so the same order cannot be double-deducted.

import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'

interface OrderItem {
  product_id: string
  quantity:   number
}

/**
 * Applies inventory deductions for a completed order.
 * Safe to call multiple times — deduplication is enforced by
 * checking for existing movements with source_id = orderId.
 */
export async function applyInventoryForCompletedOrder(
  orderId:  string,
  tenantId: string
): Promise<{ deducted: number; skipped: number; errors: string[] }> {
  const supabase = getSupabaseServerClient()
  const errors: string[] = []
  let deducted = 0
  let skipped  = 0

  // Check if inventory module is enabled for this tenant
  const { data: moduleRow } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'inventory')
    .maybeSingle()

  if (!moduleRow?.enabled) return { deducted, skipped, errors }

  // Check idempotency: has this order already been processed?
  const { data: existingMovements } = await supabase
    .from('inventory_movements')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('order_id', orderId)
    .eq('movement_type', 'sale')
    .limit(1)

  if (existingMovements && existingMovements.length > 0) {
    // Already processed — skip silently
    return { deducted: 0, skipped: 0, errors: [] }
  }

  // Fetch order items
  const { data: orderItems, error: orderErr } = await supabase
    .from('order_items')
    .select('product_id, quantity')
    .eq('order_id', orderId)

  if (orderErr || !orderItems || orderItems.length === 0) {
    return { deducted, skipped, errors }
  }

  // Process each order item
  for (const orderItem of orderItems as OrderItem[]) {
    if (!orderItem.product_id) { skipped++; continue }

    // Find inventory links for this product (deduct_on_sale = true only)
    const { data: links } = await supabase
      .from('product_inventory_links')
      .select('inventory_item_id, quantity_per_product')
      .eq('tenant_id', tenantId)
      .eq('product_id', orderItem.product_id)
      .eq('deduct_on_sale', true)

    if (!links || links.length === 0) { skipped++; continue }

    for (const link of links) {
      const deductQty = link.quantity_per_product * orderItem.quantity

      // Fetch current item quantity
      const { data: item, error: itemErr } = await supabase
        .from('inventory_items')
        .select('id, current_quantity, name, unit')
        .eq('id', link.inventory_item_id)
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .maybeSingle()

      if (itemErr || !item) {
        skipped++
        continue
      }

      const quantityBefore = Number(item.current_quantity)
      const quantityAfter  = quantityBefore - deductQty

      // Update quantity
      const { error: updateErr } = await supabase
        .from('inventory_items')
        .update({ current_quantity: quantityAfter })
        .eq('id', item.id)
        .eq('tenant_id', tenantId)

      if (updateErr) {
        errors.push(`Failed to update ${item.name}: ${updateErr.message}`)
        continue
      }

      // Record movement
      const { error: mvErr } = await supabase
        .from('inventory_movements')
        .insert({
          tenant_id:          tenantId,
          inventory_item_id:  item.id,
          movement_type:      'sale',
          quantity_delta:     -deductQty,
          quantity_before:    quantityBefore,
          quantity_after:     quantityAfter,
          order_id:           orderId,
          product_id:         orderItem.product_id,
          source_type:        'order',
          source_id:          orderId,
          reason:             `Order ${orderId} completed`,
        })

      if (mvErr) {
        errors.push(`Movement record failed for ${item.name}: ${mvErr.message}`)
        continue
      }

      deducted++
    }
  }

  // Auto-generate alerts if inventory settings say so
  if (deducted > 0) {
    const { data: invSettings } = await supabase
      .from('inventory_settings')
      .select('auto_create_alerts')
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (invSettings?.auto_create_alerts !== false) {
      // Fire and forget — don't block order completion
      supabase.rpc('recalculate_inventory_alerts', { p_tenant_id: tenantId }).then(() => {
        // alerts updated silently
      })
    }
  }

  return { deducted, skipped, errors }
}
