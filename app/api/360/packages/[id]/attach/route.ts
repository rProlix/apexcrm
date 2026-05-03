// app/api/360/packages/[id]/attach/route.ts
// POST /api/360/packages/[id]/attach
//
// Attaches a 360 package to a product (or detaches by passing productId: null).
// Verifies product belongs to the same tenant as the package.
// Owner / admin only.

import { NextRequest, NextResponse }  from 'next/server'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { resolve360ApiUser }          from '@/lib/360/auth'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()

  const { data: pkg } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (user.role !== 'owner' && pkg.tenant_id !== user.tenant_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const productId = body.productId !== undefined
    ? (typeof body.productId === 'string' ? body.productId.trim() || null : null)
    : undefined

  if (productId === undefined)
    return NextResponse.json({ error: 'productId is required (pass null to detach)' }, { status: 400 })

  if (productId !== null) {
    // Verify product belongs to same tenant
    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('tenant_id', pkg.tenant_id)
      .maybeSingle()

    if (!product) return NextResponse.json({ error: 'Product not found in this tenant' }, { status: 404 })

    // Attach: set products.spin_package_id
    await supabase
      .from('products')
      .update({ spin_package_id: id })
      .eq('id', productId)
      .eq('tenant_id', pkg.tenant_id)
  } else {
    // Detach: clear products.spin_package_id
    await supabase
      .from('products')
      .update({ spin_package_id: null })
      .eq('spin_package_id', id)
      .eq('tenant_id', pkg.tenant_id)
  }

  // Update package.product_id to match
  const { data: updatedPkg, error } = await supabase
    .from('product_360_packages')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .update({ product_id: productId as any })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('[POST /api/360/packages/[id]/attach]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ package: updatedPkg, productId })
}
