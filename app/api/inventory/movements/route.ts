// app/api/inventory/movements/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

// ── GET /api/inventory/movements ──────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const itemId = searchParams.get('item_id')
  const limit  = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200)

  const supabase = getSupabaseServerClient()
  let query = supabase
    .from('inventory_movements')
    .select('*')
    .eq('tenant_id', user.tenant_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (itemId) query = query.eq('inventory_item_id', itemId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ movements: data ?? [] })
}

// ── POST /api/inventory/movements ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager', 'staff'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { inventory_item_id, movement_type, quantity_delta, reason, notes } = body

  if (typeof inventory_item_id !== 'string') {
    return NextResponse.json({ error: 'inventory_item_id is required' }, { status: 400 })
  }
  if (typeof quantity_delta !== 'number') {
    return NextResponse.json({ error: 'quantity_delta must be a number' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  // Fetch current item to compute before/after quantities
  const { data: item, error: fetchErr } = await supabase
    .from('inventory_items')
    .select('id, current_quantity')
    .eq('id', inventory_item_id)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (fetchErr || !item) {
    return NextResponse.json({ error: 'Inventory item not found' }, { status: 404 })
  }

  const quantityBefore = Number(item.current_quantity)
  const quantityAfter  = quantityBefore + Number(quantity_delta)

  // Update item quantity
  const { error: updateErr } = await supabase
    .from('inventory_items')
    .update({ current_quantity: quantityAfter })
    .eq('id', inventory_item_id)
    .eq('tenant_id', user.tenant_id)

  if (updateErr) {
    console.error('[POST /api/inventory/movements] update failed:', updateErr.message)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  // Insert movement record
  const { data: movement, error: moveErr } = await supabase
    .from('inventory_movements')
    .insert({
      tenant_id:          user.tenant_id,
      inventory_item_id,
      movement_type:      typeof movement_type === 'string' ? movement_type : 'manual_adjustment',
      quantity_delta:     Number(quantity_delta),
      quantity_before:    quantityBefore,
      quantity_after:     quantityAfter,
      reason:             typeof reason === 'string' ? reason || null : null,
      notes:              typeof notes === 'string' ? notes || null : null,
    })
    .select()
    .single()

  if (moveErr) {
    console.error('[POST /api/inventory/movements]', moveErr.message)
    return NextResponse.json({ error: moveErr.message }, { status: 500 })
  }

  return NextResponse.json({ movement, new_quantity: quantityAfter }, { status: 201 })
}
