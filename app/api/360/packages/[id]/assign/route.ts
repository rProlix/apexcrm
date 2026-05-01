// app/api/360/packages/[id]/assign/route.ts
// POST /api/360/packages/[id]/assign
//
// Assigns (or removes) a product_360_packages spin as the active 360 viewer
// for a product (sets products.p360_package_id).
//
// Body: { product_id: string | null }
// Owner / admin only.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const supabase  = getSupabaseServerClient()
  const productId = body.product_id as string | null

  // Verify package exists and is complete
  const { data: pkg } = await supabase
    .from('product_360_packages')
    .select('id, product_id, tenant_id, status')
    .eq('id', id)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (pkg.status !== 'complete')
    return NextResponse.json({ error: 'Package is not yet complete' }, { status: 422 })

  const targetProductId = productId ?? pkg.product_id

  const { error } = await supabase
    .from('products')
    .update({ p360_package_id: productId === null ? null : id })
    .eq('id', targetProductId)
    .eq('tenant_id', pkg.tenant_id)

  if (error) {
    console.error('[POST /api/360/packages/[id]/assign]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, product_id: targetProductId, package_id: productId === null ? null : id })
}
