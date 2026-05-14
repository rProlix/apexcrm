// lib/inventory/predictions.ts
// Prediction and analytics logic for the Inventory Module.
// All calculations are tenant-safe and return null instead of fake data
// when insufficient history exists.

import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import type {
  InventoryPrediction,
  InventoryTrendSummary,
  InventoryItem,
} from './types'

const DAY_MS = 86_400_000

// ── Velocity Calculation ───────────────────────────────────────────────────────

/**
 * Calculates average daily consumption for an inventory item
 * based on negative inventory movements (sales, consume, waste, damage).
 */
export async function calculateSalesVelocity(
  tenantId: string,
  itemId: string,
  days: number = 30
): Promise<{ velocity7d: number | null; velocity30d: number | null }> {
  const supabase = getSupabaseServerClient()
  const now = new Date()
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString()
  const since7  = new Date(now.getTime() - 7 * DAY_MS).toISOString()

  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('quantity_delta, created_at')
    .eq('tenant_id', tenantId)
    .eq('inventory_item_id', itemId)
    .in('movement_type', ['sale', 'waste', 'damage', 'manual_adjustment'])
    .lt('quantity_delta', 0)
    .gte('created_at', since30)
    .order('created_at', { ascending: false })

  if (!movements || movements.length === 0) {
    return { velocity7d: null, velocity30d: null }
  }

  type MovRow = { quantity_delta: number; created_at: string }
  const consumed30 = (movements as MovRow[]).reduce((sum: number, m) => sum + Math.abs(m.quantity_delta), 0)
  const consumed7  = (movements as MovRow[])
    .filter((m) => m.created_at >= since7)
    .reduce((sum: number, m) => sum + Math.abs(m.quantity_delta), 0)

  const has7dData  = (movements as { created_at: string }[]).some((m) => m.created_at >= since7)
  const has30dData = movements.length > 0

  return {
    velocity7d:  has7dData  ? consumed7 / 7   : null,
    velocity30d: has30dData ? consumed30 / 30 : null,
  }
}

/**
 * Blends 7-day and 30-day velocity with 2:1 weighting toward recent data.
 */
export function blendVelocity(
  velocity7d: number | null,
  velocity30d: number | null
): number | null {
  if (velocity7d !== null && velocity30d !== null) {
    return (velocity7d * 2 + velocity30d) / 3
  }
  return velocity7d ?? velocity30d ?? null
}

// ── Stockout Prediction ────────────────────────────────────────────────────────

/**
 * Estimates days remaining until stockout based on current quantity and velocity.
 */
export function estimateDaysRemaining(
  currentQuantity: number,
  dailyVelocity: number | null
): number | null {
  if (dailyVelocity === null || dailyVelocity <= 0) return null
  if (currentQuantity <= 0) return 0
  return Math.floor(currentQuantity / dailyVelocity)
}

/**
 * Returns an ISO date string for predicted stockout date.
 */
export function estimateStockoutDate(
  currentQuantity: number,
  dailyVelocity: number | null
): string | null {
  const daysRemaining = estimateDaysRemaining(currentQuantity, dailyVelocity)
  if (daysRemaining === null) return null
  const date = new Date(Date.now() + daysRemaining * DAY_MS)
  return date.toISOString()
}

// ── Reorder Quantity ───────────────────────────────────────────────────────────

/**
 * Calculates suggested reorder quantity to cover the prediction window.
 */
export function calculateSuggestedReorderQuantity(
  targetQuantity: number | null,
  reorderPoint: number,
  dailyVelocity: number | null,
  predictionDays: number = 14
): number | null {
  if (targetQuantity !== null && targetQuantity > reorderPoint) {
    return targetQuantity - reorderPoint
  }
  if (dailyVelocity !== null && dailyVelocity > 0) {
    return Math.ceil(dailyVelocity * predictionDays)
  }
  return null
}

// ── Per-item Prediction ────────────────────────────────────────────────────────

export async function buildItemPrediction(
  tenantId: string,
  item: Pick<InventoryItem, 'id' | 'name' | 'current_quantity' | 'unit' | 'target_quantity' | 'reorder_point'>,
  predictionDays: number = 14
): Promise<InventoryPrediction> {
  const { velocity7d, velocity30d } = await calculateSalesVelocity(tenantId, item.id)
  const blended = blendVelocity(velocity7d, velocity30d)

  const daysRemaining = estimateDaysRemaining(item.current_quantity, blended)
  const stockoutDate  = estimateStockoutDate(item.current_quantity, blended)
  const reorderQty    = calculateSuggestedReorderQuantity(
    item.target_quantity,
    item.reorder_point,
    blended,
    predictionDays
  )

  const confidence: InventoryPrediction['confidence'] =
    velocity7d !== null && velocity30d !== null ? 'high'
    : velocity7d !== null || velocity30d !== null ? 'medium'
    : 'insufficient_data'

  return {
    item_id:                    item.id,
    item_name:                  item.name,
    current_quantity:           item.current_quantity,
    unit:                       item.unit,
    sales_velocity_daily_7d:    velocity7d,
    sales_velocity_daily_30d:   velocity30d,
    blended_velocity_daily:     blended,
    estimated_days_remaining:   daysRemaining,
    predicted_stockout_at:      stockoutDate,
    suggested_reorder_quantity: reorderQty,
    confidence,
  }
}

// ── Alert Generation ───────────────────────────────────────────────────────────

/**
 * Generates inventory alerts for all active items in a tenant.
 * Inserts new alerts and avoids duplicates.
 */
export async function generateInventoryAlerts(tenantId: string): Promise<{
  created: number
  resolved: number
}> {
  const supabase = getSupabaseServerClient()
  const { data: result } = await supabase.rpc('recalculate_inventory_alerts', {
    p_tenant_id: tenantId,
  })
  const r = result as { created: number; resolved: number } | null
  return { created: r?.created ?? 0, resolved: r?.resolved ?? 0 }
}

// ── Top Sellers / Consumed ─────────────────────────────────────────────────────

export async function getTopSellingProducts(
  tenantId: string,
  days: number = 7,
  limit: number = 10
): Promise<Array<{ product_id: string; product_name: string; total_sold: number }>> {
  const supabase = getSupabaseServerClient()
  const since = new Date(Date.now() - days * DAY_MS).toISOString()

  type OrderItemRow = { product_id: string; quantity: number | null }
  const { data: items } = await (supabase as ReturnType<typeof getSupabaseServerClient>)
    .from('order_items')
    .select('product_id, quantity, orders!inner(tenant_id, created_at, status)')
    .eq('orders.tenant_id', tenantId)
    .gte('orders.created_at', since)
    .not('orders.status', 'in', '(cancelled,refunded)') as { data: OrderItemRow[] | null }

  if (!items || items.length === 0) return []

  const productTotals = new Map<string, number>()
  for (const item of items) {
    const prev = productTotals.get(item.product_id) ?? 0
    productTotals.set(item.product_id, prev + (item.quantity ?? 1))
  }

  const productIds = Array.from(productTotals.keys())
  type ProductRow = { id: string; name: string }
  const { data: products } = await supabase
    .from('products')
    .select('id, name')
    .in('id', productIds) as { data: ProductRow[] | null }

  const nameMap = new Map((products ?? []).map((p) => [p.id, p.name]))

  return Array.from(productTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([product_id, total_sold]) => ({
      product_id,
      product_name: nameMap.get(product_id) ?? 'Unknown',
      total_sold,
    }))
}

export async function getTopConsumedInventoryItems(
  tenantId: string,
  days: number = 7,
  limit: number = 10
): Promise<Array<{ item_id: string; item_name: string; unit: string; total_consumed: number }>> {
  const supabase = getSupabaseServerClient()
  const since = new Date(Date.now() - days * DAY_MS).toISOString()

  type MovRow2 = { inventory_item_id: string; quantity_delta: number }
  const { data: movements } = await supabase
    .from('inventory_movements')
    .select('inventory_item_id, quantity_delta')
    .eq('tenant_id', tenantId)
    .in('movement_type', ['sale', 'waste', 'damage', 'consume'])
    .lt('quantity_delta', 0)
    .gte('created_at', since) as { data: MovRow2[] | null }

  if (!movements || movements.length === 0) return []

  const itemTotals = new Map<string, number>()
  for (const m of movements) {
    const prev = itemTotals.get(m.inventory_item_id) ?? 0
    itemTotals.set(m.inventory_item_id, prev + Math.abs(m.quantity_delta))
  }

  const itemIds = Array.from(itemTotals.keys())
  type ItemRow2 = { id: string; name: string; unit: string }
  const { data: items } = await supabase
    .from('inventory_items')
    .select('id, name, unit')
    .in('id', itemIds) as { data: ItemRow2[] | null }

  const itemMap = new Map((items ?? []).map((i: ItemRow2) => [i.id, i]))

  return Array.from(itemTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item_id, total_consumed]) => ({
      item_id,
      item_name:      itemMap.get(item_id)?.name ?? 'Unknown',
      unit:           itemMap.get(item_id)?.unit ?? 'unit',
      total_consumed,
    }))
}

// ── Full Trend Summary ─────────────────────────────────────────────────────────

export async function buildTrendSummary(
  tenantId: string,
  predictionDays: number = 14
): Promise<InventoryTrendSummary> {
  const supabase = getSupabaseServerClient()

  const [
    products7d,
    products30d,
    consumed7d,
    consumed30d,
    { data: activeItems },
  ] = await Promise.all([
    getTopSellingProducts(tenantId, 7),
    getTopSellingProducts(tenantId, 30),
    getTopConsumedInventoryItems(tenantId, 7),
    getTopConsumedInventoryItems(tenantId, 30),
    (supabase as ReturnType<typeof getSupabaseServerClient>)
      .from('inventory_items')
      .select('id, name, current_quantity, unit, target_quantity, reorder_point')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .limit(50) as Promise<{ data: Array<{ id: string; name: string; current_quantity: number; unit: string; target_quantity: number | null; reorder_point: number }> | null }>,
  ])

  type ActiveItem = { id: string; name: string; current_quantity: number; unit: string; target_quantity: number | null; reorder_point: number }
  const typedActiveItems = (activeItems ?? []) as ActiveItem[]

  // Build predictions for items that are low or consumed
  const itemsNeedingPrediction = typedActiveItems.filter(
    (item) => item.current_quantity <= item.reorder_point * 2
  )

  const predictions = await Promise.all(
    itemsNeedingPrediction.slice(0, 20).map((item) =>
      buildItemPrediction(tenantId, item, predictionDays)
    )
  )

  const validPredictions = predictions.filter(
    (p) => p.confidence !== 'insufficient_data' || p.current_quantity <= 0
  )

  // Suggested reorders
  const suggestedReorders = typedActiveItems
    .filter((item) => item.current_quantity <= item.reorder_point)
    .map((item) => {
      const pred = predictions.find((p) => p.item_id === item.id)
      const suggested = pred?.suggested_reorder_quantity
        ?? (item.target_quantity ? item.target_quantity - item.current_quantity : item.reorder_point * 2)

      return {
        item_id:            item.id,
        item_name:          item.name,
        unit:               item.unit,
        current_quantity:   item.current_quantity,
        reorder_point:      item.reorder_point,
        suggested_quantity: Math.max(1, Math.ceil(suggested)),
        reason:             item.current_quantity <= 0
          ? 'Out of stock'
          : `Below reorder point (${item.reorder_point} ${item.unit})`,
      }
    })

  const hasSufficientData =
    products7d.length > 0 ||
    products30d.length > 0 ||
    consumed7d.length > 0 ||
    consumed30d.length > 0

  return {
    top_store_products_7d:  products7d,
    top_store_products_30d: products30d,
    top_consumed_items_7d:  consumed7d,
    top_consumed_items_30d: consumed30d,
    predictions:            validPredictions,
    suggested_reorders:     suggestedReorders,
    has_sufficient_data:    hasSufficientData,
  }
}
