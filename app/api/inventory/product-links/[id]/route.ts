// app/api/inventory/product-links/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

type Ctx = { params: Promise<{ id: string }> }

// ── DELETE /api/inventory/product-links/[id] ──────────────────────────────────
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()
  const { error } = await supabase
    .from('product_inventory_links')
    .delete()
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// ── PATCH /api/inventory/product-links/[id] ───────────────────────────────────
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner', 'manager'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  if (typeof body.quantity_per_product === 'number') patch.quantity_per_product = body.quantity_per_product
  if (typeof body.deduct_on_sale === 'boolean') patch.deduct_on_sale = body.deduct_on_sale

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('product_inventory_links')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ link: data })
}
