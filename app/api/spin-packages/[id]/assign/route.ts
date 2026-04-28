// app/api/spin-packages/[id]/assign/route.ts
// POST /api/spin-packages/[id]/assign
//
// Assigns a ready spin package to a product (or unassigns via product_id: null).
// Only packages with status = "ready" may be assigned.
// Owner / admin only.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user    = await resolveStoreUser(req)
  if (!user)              return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { product_id } = body
  const supabase        = getSupabaseServerClient()

  // Verify package exists and is ready
  const { data: pkg } = await supabase
    .from('spin_packages')
    .select('id, status, tenant_id, product_id')
    .eq('id', id)
    .eq('tenant_id', user.tenant_id)
    .single()

  if (!pkg) return NextResponse.json({ error: 'Spin package not found' }, { status: 404 })
  if (pkg.status !== 'ready')
    return NextResponse.json({ error: 'Only packages with status "ready" can be assigned' }, { status: 422 })

  // Un-assign (detach) flow
  if (product_id === null || product_id === undefined) {
    await supabase
      .from('products')
      .update({ spin_package_id: null })
      .eq('spin_package_id', id)
      .eq('tenant_id', user.tenant_id)

    return NextResponse.json({ success: true, assigned: false })
  }

  if (typeof product_id !== 'string')
    return NextResponse.json({ error: 'product_id must be a string or null' }, { status: 400 })

  // Verify product belongs to tenant
  const { data: product } = await supabase
    .from('products')
    .select('id')
    .eq('id', product_id)
    .eq('tenant_id', user.tenant_id)
    .maybeSingle()

  if (!product) return NextResponse.json({ error: 'Product not found in this tenant' }, { status: 404 })

  // Detach existing package from the target product (if any)
  await supabase
    .from('products')
    .update({ spin_package_id: null })
    .eq('id', product_id)
    .eq('tenant_id', user.tenant_id)

  // Attach the new package
  const { error } = await supabase
    .from('products')
    .update({ spin_package_id: id })
    .eq('id', product_id)
    .eq('tenant_id', user.tenant_id)

  if (error) {
    console.error('[POST /api/spin-packages/[id]/assign]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, assigned: true, product_id })
}
