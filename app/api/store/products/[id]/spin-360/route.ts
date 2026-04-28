// app/api/store/products/[id]/spin-360/route.ts
// GET /api/store/products/[id]/spin-360
//
// Public (no auth) — returns the ordered image_urls for the active 360 spin
// attached to a product. Used by the customer-facing SpinViewer360 component.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const supabase = getSupabaseServerClient()

  // Load product — check spin_360_id
  const { data: product } = await supabase
    .from('products')
    .select('id, spin_360_id')
    .eq('id', id)
    .eq('is_active', true)
    .single()

  if (!product?.spin_360_id) return NextResponse.json({ urls: [], total_frames: 0 })

  const { data: spin } = await supabase
    .from('product_360_spins')
    .select('image_urls, total_frames, name')
    .eq('id', product.spin_360_id)
    .eq('status', 'ready')
    .single()

  if (!spin) return NextResponse.json({ urls: [], total_frames: 0 })

  const urls = Array.isArray(spin.image_urls) ? (spin.image_urls as string[]) : []

  return NextResponse.json({
    spin_id:      product.spin_360_id,
    name:         spin.name,
    total_frames: spin.total_frames,
    urls,
  })
}
