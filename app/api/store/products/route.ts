// app/api/store/products/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

// ─── GET /api/store/products ──────────────────────────────────────────────────
// admin/owner → all products for their tenant
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Owners can optionally target a different tenant via query param
  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/store/products]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ products: data })
}

// ─── POST /api/store/products ─────────────────────────────────────────────────
// admin/owner only — create a product scoped to their tenant
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { name, description, price, currency, inventory_count, is_active } = body

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof price !== 'number' || price < 0) {
    return NextResponse.json({ error: 'price must be a non-negative number' }, { status: 400 })
  }

  // Always scope to the resolved tenant — never trust a client-supplied tenant_id
  const tenantId = user.tenant_id

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('products')
    .insert({
      tenant_id:       tenantId,
      name:            name.trim(),
      description:     typeof description === 'string' ? description.trim() || null : null,
      price,
      currency:        typeof currency === 'string' && currency.length === 3 ? currency : 'USD',
      inventory_count: typeof inventory_count === 'number' ? Math.max(0, Math.floor(inventory_count)) : 0,
      is_active:       typeof is_active === 'boolean' ? is_active : true,
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/store/products]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ product: data }, { status: 201 })
}
