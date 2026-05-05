// app/api/360/packages/[id]/attach/route.ts
// Attaches/detaches a 360 package to a product.
// Now uses canonical lib/product-360/auth instead of deleted lib/360/auth.

import { NextRequest, NextResponse }  from 'next/server'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { resolveP360ApiUser }         from '@/lib/product-360/auth'

export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolveP360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { data: pkg } = await db
    .from('product_360_packages')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (user.role !== 'owner' && pkg.tenant_id !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const productId = body.productId !== undefined
    ? (typeof body.productId === 'string' ? body.productId.trim() || null : null)
    : undefined

  if (productId === undefined) {
    return NextResponse.json({ error: 'productId is required (pass null to detach)' }, { status: 400 })
  }

  if (productId !== null) {
    const { data: product } = await db
      .from('products').select('id').eq('id', productId).eq('tenant_id', pkg.tenant_id).maybeSingle()
    if (!product) return NextResponse.json({ error: 'Product not found in this tenant' }, { status: 404 })

    await db.from('products').update({ spin_package_id: id }).eq('id', productId).eq('tenant_id', pkg.tenant_id)
  } else {
    await db.from('products').update({ spin_package_id: null }).eq('spin_package_id', id).eq('tenant_id', pkg.tenant_id)
  }

  const { data: updated, error } = await db
    .from('product_360_packages')
    .update({ product_id: productId })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ package: updated, productId })
}
