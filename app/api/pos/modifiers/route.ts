// app/api/pos/modifiers/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'
import { getPOSClient } from '@/lib/pos/supabasePOS'

export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user || !['admin','owner','manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.modifier_group_id) return NextResponse.json({ error: 'modifier_group_id required' }, { status: 400 })
  if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const supabase = getPOSClient()
  const { data, error } = await supabase
    .from('pos_modifiers')
    .insert({
      tenant_id:          user.tenant_id,
      modifier_group_id:  body.modifier_group_id,
      name:               body.name,
      modifier_type:      body.modifier_type ?? 'addon',
      price_delta_cents:  body.price_delta_cents ?? 0,
      inventory_item_id:  body.inventory_item_id ?? null,
      affects_inventory:  body.affects_inventory ?? false,
      quantity_delta:     body.quantity_delta ?? 0,
      is_default:         body.is_default ?? false,
      sort_order:         body.sort_order ?? 0,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ modifier: data }, { status: 201 })
}
