// app/api/360-spins/[id]/assign/route.ts
// POST /api/360-spins/[id]/assign
// Attaches or detaches a ready spin from a product's spin_360_id.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user    = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { product_id } = body
  const supabase        = getSupabaseServerClient()

  const { data: spin } = await supabase
    .from('product_360_spins')
    .select('id, status, tenant_id, product_id')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!spin) return NextResponse.json({ error: 'Spin not found' }, { status: 404 })
  if (spin.status !== 'ready')
    return NextResponse.json({ error: 'Only ready spins can be assigned' }, { status: 422 })

  // Detach flow
  if (product_id === null || product_id === undefined) {
    await supabase
      .from('products')
      .update({ spin_360_id: null })
      .eq('spin_360_id', id)
      .eq('tenant_id', user.tenant_id)
    return NextResponse.json({ success: true, assigned: false })
  }

  if (typeof product_id !== 'string')
    return NextResponse.json({ error: 'product_id must be a string or null' }, { status: 400 })

  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('id', product_id)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // Detach any existing spin from target product
  await supabase
    .from('products')
    .update({ spin_360_id: null })
    .eq('id', product_id)
    .eq('tenant_id', user.tenant_id)

  // Attach this spin
  const { error } = await supabase
    .from('products')
    .update({ spin_360_id: id })
    .eq('id', product_id)
    .eq('tenant_id', user.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, assigned: true, product_id })
}
