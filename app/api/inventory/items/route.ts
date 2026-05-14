// app/api/inventory/items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

async function checkInventoryModule(tenantId: string): Promise<boolean> {
  const supabase = getSupabaseServerClient()
  const { data } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', 'inventory')
    .maybeSingle()
  return data?.enabled === true
}

// ── GET /api/inventory/items ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  if (user.role !== 'owner' && !(await checkInventoryModule(tenantId))) {
    return NextResponse.json({ error: 'Inventory module not enabled' }, { status: 403 })
  }

  const { searchParams } = req.nextUrl
  const search    = searchParams.get('search') ?? ''
  const category  = searchParams.get('category') ?? ''
  const itemType  = searchParams.get('item_type') ?? ''
  const activeStr = searchParams.get('is_active')
  const lowStock  = searchParams.get('low_stock') === 'true'

  const supabase = getSupabaseServerClient()
  let query = supabase
    .from('inventory_items')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true })

  if (activeStr !== null) {
    query = query.eq('is_active', activeStr !== 'false')
  }
  if (category)  query = query.eq('category', category)
  if (itemType)  query = query.eq('item_type', itemType)
  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%,category.ilike.%${search}%`)
  }

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/inventory/items]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  type ItemRow = { current_quantity: number; reorder_point: number; [key: string]: unknown }
  let items: ItemRow[] = (data ?? []) as ItemRow[]
  if (lowStock) {
    items = items.filter((i) => i.current_quantity <= i.reorder_point && i.current_quantity > 0)
  }

  return NextResponse.json({ items })
}

// ── POST /api/inventory/items ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const tenantId = user.tenant_id
  if (user.role !== 'owner' && !(await checkInventoryModule(tenantId))) {
    return NextResponse.json({ error: 'Inventory module not enabled' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, item_type, unit, ...rest } = body
  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('inventory_items')
    .insert({
      tenant_id:        tenantId,
      name:             name.trim(),
      item_type:        typeof item_type === 'string' ? item_type : 'supply',
      unit:             typeof unit === 'string' ? unit : 'unit',
      description:      typeof rest.description === 'string' ? rest.description : null,
      sku:              typeof rest.sku === 'string' ? rest.sku || null : null,
      barcode:          typeof rest.barcode === 'string' ? rest.barcode || null : null,
      category:         typeof rest.category === 'string' ? rest.category || null : null,
      current_quantity: typeof rest.current_quantity === 'number' ? rest.current_quantity : 0,
      reorder_point:    typeof rest.reorder_point === 'number' ? rest.reorder_point : 0,
      target_quantity:  typeof rest.target_quantity === 'number' ? rest.target_quantity : null,
      cost_per_unit:    typeof rest.cost_per_unit === 'number' ? rest.cost_per_unit : null,
      supplier_name:    typeof rest.supplier_name === 'string' ? rest.supplier_name || null : null,
      supplier_url:     typeof rest.supplier_url === 'string' ? rest.supplier_url || null : null,
      supplier_phone:   typeof rest.supplier_phone === 'string' ? rest.supplier_phone || null : null,
      supplier_email:   typeof rest.supplier_email === 'string' ? rest.supplier_email || null : null,
      storage_location: typeof rest.storage_location === 'string' ? rest.storage_location || null : null,
      image_url:        typeof rest.image_url === 'string' ? rest.image_url || null : null,
      is_active:        typeof rest.is_active === 'boolean' ? rest.is_active : true,
      is_sellable:      typeof rest.is_sellable === 'boolean' ? rest.is_sellable : false,
      linked_product_id: typeof rest.linked_product_id === 'string' ? rest.linked_product_id || null : null,
      created_by:       null,
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/inventory/items]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
