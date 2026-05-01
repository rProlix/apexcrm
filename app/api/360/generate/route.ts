// app/api/360/generate/route.ts
// POST /api/360/generate
//
// Creates a product_360_packages record and immediately starts generation.
// Generation runs in the background (Vercel Fluid Compute, up to 300 s).
// The client polls GET /api/360/generate/[id] for status.
//
// Owner / admin only.

import { NextRequest, NextResponse }     from 'next/server'
import { getSupabaseServerClient }        from '@/lib/supabase/server'
import { resolveStoreUser }              from '@/lib/auth/resolveStoreUser'
import { build360FramePrompt }           from '@/lib/services/spin-generator/generate360'
import { generatePackage360 }            from '@/lib/services/spin-generator/generate360Package'

export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { product_id, name, description, frame_count } = body

  if (typeof product_id  !== 'string' || !product_id.trim())
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  if (typeof description !== 'string' || !description.trim())
    return NextResponse.json({ error: 'description is required' }, { status: 400 })

  const frames = typeof frame_count === 'number' ? Math.round(frame_count) : 24
  if (frames < 8 || frames > 72)
    return NextResponse.json({ error: 'frame_count must be between 8 and 72' }, { status: 400 })

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

  // Build the master prompt (verify it compiles)
  const masterPrompt = `${product.name} — ${description.trim()}`
  build360FramePrompt(masterPrompt, 0)  // throws on bad input

  const spinName = typeof name === 'string' && name.trim()
    ? name.trim()
    : `${product.name} — 360° Spin`

  // Create package record
  const { data: pkg, error: createErr } = await supabase
    .from('product_360_packages')
    .insert({
      tenant_id:   tenantId,
      product_id:  product_id.trim(),
      name:        spinName,
      prompt:      masterPrompt,
      frame_count: frames,
      status:      'pending',
    })
    .select()
    .single()

  if (createErr || !pkg) {
    console.error('[POST /api/360/generate]', createErr?.message)
    return NextResponse.json({ error: createErr?.message ?? 'Failed to create package' }, { status: 500 })
  }

  // Fire-and-forget generation (long-running on Fluid Compute)
  generatePackage360(pkg.id).catch(err =>
    console.error('[POST /api/360/generate] background generation error:', err)
  )

  return NextResponse.json(
    { id: pkg.id, status: pkg.status, name: pkg.name, frame_count: frames },
    { status: 201 },
  )
}
