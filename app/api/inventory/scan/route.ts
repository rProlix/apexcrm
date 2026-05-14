// app/api/inventory/scan/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import type { ScanRequest, ScanResult } from '@/lib/inventory/types'

// ── POST /api/inventory/scan ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager', 'staff'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: ScanRequest
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { barcode, action = 'lookup', quantity = 1, itemId, itemDraft } = body

  if (!barcode?.trim()) {
    return NextResponse.json({ error: 'barcode is required' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const tenantId = user.tenant_id

  // Look up item by barcode or itemId
  let item = null
  if (itemId) {
    const { data } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    item = data
  } else {
    const { data } = await supabase
      .from('inventory_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('barcode', barcode.trim())
      .eq('is_active', true)
      .maybeSingle()
    item = data
  }

  let movement = null
  let resultMsg = ''
  let scanEventItemId: string | null = item?.id ?? null

  switch (action) {
    case 'lookup': {
      resultMsg = item ? `Found: ${item.name}` : 'No item found for this barcode'
      break
    }

    case 'restock':
    case 'consume': {
      if (!item) {
        resultMsg = 'Item not found — cannot update quantity'
        break
      }
      const delta = action === 'restock' ? Math.abs(quantity) : -Math.abs(quantity)
      const quantityBefore = Number(item.current_quantity)
      const quantityAfter  = quantityBefore + delta

      await supabase
        .from('inventory_items')
        .update({ current_quantity: quantityAfter })
        .eq('id', item.id)
        .eq('tenant_id', tenantId)

      const { data: mv } = await supabase
        .from('inventory_movements')
        .insert({
          tenant_id:          tenantId,
          inventory_item_id:  item.id,
          movement_type:      action === 'restock' ? 'restock' : 'manual_adjustment',
          quantity_delta:     delta,
          quantity_before:    quantityBefore,
          quantity_after:     quantityAfter,
          scanned_barcode:    barcode,
          reason:             `Barcode scan — ${action}`,
        })
        .select()
        .single()
      movement = mv
      resultMsg = `${action === 'restock' ? 'Restocked' : 'Consumed'} ${Math.abs(quantity)} ${item.unit}. New quantity: ${quantityAfter}`
      break
    }

    case 'adjust':
    case 'count': {
      if (!item) {
        resultMsg = 'Item not found'
        break
      }
      const quantityBefore = Number(item.current_quantity)
      const quantityAfter  = action === 'count' ? Math.abs(quantity) : quantityBefore + quantity
      const delta = quantityAfter - quantityBefore

      await supabase
        .from('inventory_items')
        .update({ current_quantity: quantityAfter })
        .eq('id', item.id)
        .eq('tenant_id', tenantId)

      await supabase
        .from('inventory_movements')
        .insert({
          tenant_id:          tenantId,
          inventory_item_id:  item.id,
          movement_type:      action === 'count' ? 'count_correction' : 'manual_adjustment',
          quantity_delta:     delta,
          quantity_before:    quantityBefore,
          quantity_after:     quantityAfter,
          scanned_barcode:    barcode,
          reason:             `Barcode scan — ${action}`,
        })
      resultMsg = `Quantity set to ${quantityAfter} ${item.unit}`
      break
    }

    case 'create_item': {
      if (!itemDraft || typeof itemDraft.name !== 'string') {
        resultMsg = 'itemDraft.name is required to create an item'
        break
      }
      const { data: newItem, error: createErr } = await supabase
        .from('inventory_items')
        .insert({
          tenant_id:    tenantId,
          barcode:      barcode.trim(),
          name:         itemDraft.name.trim(),
          item_type:    itemDraft.item_type ?? 'supply',
          unit:         itemDraft.unit ?? 'unit',
          description:  itemDraft.description ?? null,
          category:     itemDraft.category ?? null,
          sku:          itemDraft.sku ?? null,
          current_quantity: itemDraft.current_quantity ?? 0,
          reorder_point:    itemDraft.reorder_point ?? 0,
        })
        .select()
        .single()

      if (createErr) {
        resultMsg = `Failed to create item: ${createErr.message}`
      } else {
        item = newItem
        scanEventItemId = newItem?.id ?? null
        resultMsg = `Created new item: ${newItem?.name}`
      }
      break
    }

    case 'link_item': {
      if (!itemId || !item) {
        resultMsg = 'itemId required to link barcode'
        break
      }
      const { error: linkErr } = await supabase
        .from('inventory_items')
        .update({ barcode: barcode.trim() })
        .eq('id', itemId)
        .eq('tenant_id', tenantId)

      resultMsg = linkErr
        ? `Failed to link: ${linkErr.message}`
        : `Barcode linked to ${item.name}`
      break
    }

    default:
      resultMsg = 'Unknown action'
  }

  // Always log scan event
  const { data: scanEvent } = await supabase
    .from('inventory_scan_events')
    .insert({
      tenant_id:          tenantId,
      barcode:            barcode.trim(),
      inventory_item_id:  scanEventItemId,
      scan_action:        action,
      quantity,
      result:             resultMsg,
    })
    .select('id')
    .single()

  const result: ScanResult = {
    ok:            true,
    action,
    barcode:       barcode.trim(),
    item,
    movement,
    scan_event_id: scanEvent?.id ?? '',
    message:       resultMsg,
  }

  return NextResponse.json(result)
}
