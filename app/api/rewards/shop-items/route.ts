// app/api/rewards/shop-items/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser, resolveStoreCustomer } from '@/lib/auth/resolveStoreUser'

// ─── GET /api/rewards/shop-items ──────────────────────────────────────────────
// admin/owner → all items; customer → active items only
export async function GET(req: NextRequest) {
  const supabase = getSupabaseServerClient()

  // Try admin first
  const dashUser = await resolveStoreUser(req)
  if (dashUser && (dashUser.role === 'admin' || dashUser.role === 'owner')) {
    const tenantId = dashUser.role === 'owner'
      ? (req.nextUrl.searchParams.get('tenant_id') ?? dashUser.tenant_id)
      : dashUser.tenant_id

    const { data, error } = await supabase
      .from('reward_shop_items')
      .select('*, products(name, price)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ items: data })
  }

  // Customer: active items only
  const customer = await resolveStoreCustomer(req)
  if (!customer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('reward_shop_items')
    .select('*, products(name, price)')
    .eq('tenant_id', customer.tenant_id)
    .eq('is_active', true)
    .order('points_cost', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data })
}

// ─── POST /api/rewards/shop-items ─────────────────────────────────────────────
// admin/owner only
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }) }

  const { name, description, points_cost, is_active, image_url, product_id,
          redemption_type, discount_type, discount_value, inventory_count,
          max_redemptions_per_customer } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof points_cost !== 'number' || points_cost <= 0) {
    return NextResponse.json({ error: 'points_cost must be a positive number' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  // Verify product belongs to tenant if provided
  if (typeof product_id === 'string') {
    const { data: prod } = await supabase
      .from('products')
      .select('id')
      .eq('id', product_id)
      .eq('tenant_id', user.tenant_id)
      .maybeSingle()
    if (!prod) return NextResponse.json({ error: 'Product not found in your store' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('reward_shop_items')
    .insert({
      tenant_id:                    user.tenant_id,
      name:                         name.trim(),
      description:                  typeof description === 'string' ? description.trim() || null : null,
      points_cost:                  Math.floor(points_cost),
      is_active:                    typeof is_active === 'boolean' ? is_active : true,
      image_url:                    typeof image_url === 'string' ? image_url || null : null,
      product_id:                   typeof product_id === 'string' ? product_id || null : null,
      redemption_type:              typeof redemption_type === 'string' ? redemption_type : 'points_only',
      discount_type:                typeof discount_type === 'string' ? discount_type || null : null,
      discount_value:               typeof discount_value === 'number' ? discount_value : null,
      inventory_count:              typeof inventory_count === 'number' ? Math.max(0, Math.floor(inventory_count)) : 0,
      max_redemptions_per_customer: typeof max_redemptions_per_customer === 'number' ? max_redemptions_per_customer : null,
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/rewards/shop-items]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data }, { status: 201 })
}
