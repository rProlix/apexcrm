// app/api/inventory/product-links/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

// ── GET /api/inventory/product-links?productId= ───────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const productId = req.nextUrl.searchParams.get('productId')

  const supabase = getSupabaseServerClient()
  let query = supabase
    .from('product_inventory_links')
    .select(`
      *,
      inventory_items(name, unit, current_quantity)
    `)
    .eq('tenant_id', user.tenant_id)
    .order('created_at', { ascending: true })

  if (productId) query = query.eq('product_id', productId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  type RawLink = Record<string, unknown> & { inventory_items?: { name?: string; unit?: string; current_quantity?: number } | null }
  const links = (data ?? []).map((l: RawLink) => {
    const inv = l.inventory_items
    const { inventory_items: _inv, ...rest } = l
    return {
      ...rest,
      item_name:        inv?.name ?? null,
      item_unit:        inv?.unit ?? null,
      current_quantity: inv?.current_quantity ?? null,
    }
  })

  return NextResponse.json({ links })
}

// ── POST /api/inventory/product-links ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { product_id, inventory_item_id, quantity_per_product, deduct_on_sale } = body

  if (typeof product_id !== 'string' || typeof inventory_item_id !== 'string') {
    return NextResponse.json({ error: 'product_id and inventory_item_id are required' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('product_inventory_links')
    .upsert({
      tenant_id:            user.tenant_id,
      product_id,
      inventory_item_id,
      quantity_per_product: typeof quantity_per_product === 'number' ? quantity_per_product : 1,
      deduct_on_sale:       typeof deduct_on_sale === 'boolean' ? deduct_on_sale : true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ link: data }, { status: 201 })
}
