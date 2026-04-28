// app/api/ai/generate-360/route.ts
// POST /api/ai/generate-360
//
// Creates a new product_360_spins record with status "generating".
// Returns immediately with { id } so the client can fire-and-forget
// the /run endpoint and poll this ID for progress.
//
// Owner / admin only.

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'
import { build360FramePrompt }       from '@/lib/services/spin-generator/generate360'

export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { product_id, product_name, description, angle_count, name } = body

  if (typeof product_id   !== 'string' || !product_id.trim())
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  if (typeof description  !== 'string' || !description.trim())
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  if (typeof product_name !== 'string' || !product_name.trim())
    return NextResponse.json({ error: 'product_name is required' }, { status: 400 })

  const frames   = typeof angle_count === 'number' ? Math.round(angle_count) : 24
  if (frames < 8 || frames > 72)
    return NextResponse.json({ error: 'angle_count must be between 8 and 72' }, { status: 400 })

  const tenantId = user.role === 'owner'
    ? (typeof body.tenant_id === 'string' ? body.tenant_id : user.tenant_id)
    : user.tenant_id

  const supabase = getSupabaseServerClient()

  // Verify product belongs to this tenant
  const { data: product } = await supabase
    .from('products')
    .select('id, name')
    .eq('id', product_id.trim())
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!product)
    return NextResponse.json({ error: 'Product not found in this tenant' }, { status: 404 })

  // Build the base prompt description (product_name is prepended automatically by the prompt builder)
  const baseDesc  = `${product_name.trim()} — ${description.trim()}`
  // Verify the prompt builder works (will throw if description is empty)
  build360FramePrompt(baseDesc, 0)

  const spinName  = typeof name === 'string' && name.trim()
    ? name.trim()
    : `${product.name} — 360° Spin`

  const { data, error } = await supabase
    .from('product_360_spins')
    .insert({
      tenant_id:    tenantId,
      product_id:   product_id.trim(),
      name:         spinName,
      prompt:       baseDesc,
      total_frames: frames,
      image_urls:   [],
      status:       'generating',
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/ai/generate-360]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ id: data.id, status: data.status }, { status: 201 })
}
