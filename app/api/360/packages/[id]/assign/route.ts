// app/api/360/packages/[id]/assign/route.ts
// REDIRECT: This endpoint has moved to /api/360/packages/[id]/attach
// Forwards to the canonical attach route for backwards compatibility.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolve360ApiUser }         from '@/lib/360/auth'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const user   = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Bridge old field name (product_id) to new field name (productId)
  const productId = body.product_id !== undefined
    ? body.product_id
    : body.productId

  const supabase = getSupabaseServerClient()

  const { data: pkg } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id')
    .eq('id', id)
    .maybeSingle()

  if (!pkg) return NextResponse.json({ error: 'Package not found' }, { status: 404 })
  if (user.role !== 'owner' && pkg.tenant_id !== user.tenant_id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (productId && typeof productId === 'string') {
    await supabase
      .from('products')
      .update({ spin_package_id: id })
      .eq('id', productId)
      .eq('tenant_id', pkg.tenant_id)

    await supabase
      .from('product_360_packages')
      .update({ product_id: productId })
      .eq('id', id)
  } else {
    await supabase
      .from('products')
      .update({ spin_package_id: null })
      .eq('spin_package_id', id)
      .eq('tenant_id', pkg.tenant_id)

    await supabase
      .from('product_360_packages')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ product_id: null as any })
      .eq('id', id)
  }

  return NextResponse.json({ success: true })
}
