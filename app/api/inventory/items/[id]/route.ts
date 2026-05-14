// app/api/inventory/items/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryClient as getSupabaseServerClient } from '@/lib/inventory/supabaseInventory'
import { resolveStoreUser } from '@/lib/auth/resolveStoreUser'

type Ctx = { params: Promise<{ id: string }> }

// ── GET /api/inventory/items/[id] ──────────────────────────────────────────────
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ item: data })
}

// ── PATCH /api/inventory/items/[id] ───────────────────────────────────────────
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

  // Strip fields that must not be updated via API
  const { id: _id, tenant_id: _tid, created_at: _ca, created_by: _cb, ...patch } = body

  const supabase = getSupabaseServerClient()

  // Verify ownership
  const { data: existing } = await supabase
    .from('inventory_items')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await supabase
    .from('inventory_items')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .select()
    .single()

  if (error) {
    console.error('[PATCH /api/inventory/items/[id]]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ item: data })
}

// ── DELETE /api/inventory/items/[id] ──────────────────────────────────────────
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['admin', 'owner'].includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabaseServerClient()
  const { error } = await supabase
    .from('inventory_items')
    .delete()
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
