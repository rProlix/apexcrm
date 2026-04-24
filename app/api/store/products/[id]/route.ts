// app/api/store/products/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

// ─── PATCH /api/store/products/[id] ──────────────────────────────────────────
// admin/owner only — update a product that belongs to their tenant
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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

  const supabase = getSupabaseServerClient()

  // Verify the product belongs to this user's tenant
  const { data: existing } = await supabase
    .from('products')
    .select('id, tenant_id')
    .eq('id', (await params).id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  // Owners can edit any tenant's products; admins only their own
  if (user.role !== 'owner' && existing.tenant_id !== user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const allowed = [
    'name', 'description', 'price', 'currency', 'inventory_count', 'is_active',
    // Rewards configuration fields (added by 009_rewards.sql migration)
    'rewards_points_earned', 'rewards_enabled', 'rewards_multiplier',
  ]
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('products') as any)
    .update(updates)
    .eq('id', (await params).id)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/store/products/:id]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ product: data })
}

// ─── DELETE /api/store/products/[id] ─────────────────────────────────────────
// admin/owner only — delete a product that belongs to their tenant
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await resolveStoreUser(req)

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (user.role !== 'admin' && user.role !== 'owner') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()

  const { data: existing } = await supabase
    .from('products')
    .select('id, tenant_id')
    .eq('id', (await params).id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  }

  if (user.role !== 'owner' && existing.tenant_id !== user.tenant_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', (await params).id)

  if (error) {
    console.error('[DELETE /api/store/products/:id]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
