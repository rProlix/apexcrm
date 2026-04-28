// app/api/store/products/[id]/spin/route.ts
// GET /api/store/products/[id]/spin
//
// Public endpoint (no auth required) — returns the spin images for a product
// whose assigned spin package is in "ready" state.
// Used by the customer-facing SpinViewer component.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = getSupabaseServerClient()

  // Load the product and its assigned spin package
  const { data: product, error: productErr } = await supabase
    .from('products')
    .select('id, spin_package_id')
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (productErr || !product || !product.spin_package_id) {
    return NextResponse.json({ images: [] })
  }

  const { data: pkg, error: pkgErr } = await supabase
    .from('spin_packages')
    .select('id, status, image_count')
    .eq('id', product.spin_package_id)
    .eq('status', 'ready')
    .single()

  if (pkgErr || !pkg) {
    return NextResponse.json({ images: [] })
  }

  const { data: images, error: imgErr } = await supabase
    .from('spin_images')
    .select('frame_index, image_url')
    .eq('spin_package_id', pkg.id)
    .order('frame_index', { ascending: true })

  if (imgErr) {
    console.error('[GET /api/store/products/[id]/spin]', imgErr.message)
    return NextResponse.json({ images: [] })
  }

  return NextResponse.json({
    package_id:  pkg.id,
    image_count: pkg.image_count,
    images: (images ?? []).map(i => ({ frame_index: i.frame_index, url: i.image_url })),
  })
}
