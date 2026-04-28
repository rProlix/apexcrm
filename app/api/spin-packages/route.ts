// app/api/spin-packages/route.ts
// GET  /api/spin-packages          — list packages for a tenant
// POST /api/spin-packages          — create a new draft spin package

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { resolveStoreUser }          from '@/lib/auth/resolveStoreUser'

// ─── GET /api/spin-packages ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user)                                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tenantId = user.role === 'owner'
    ? (req.nextUrl.searchParams.get('tenant_id') ?? user.tenant_id)
    : user.tenant_id

  const productId = req.nextUrl.searchParams.get('product_id')

  const supabase = getSupabaseServerClient()
  let query = supabase
    .from('spin_packages')
    .select('*, spin_images(id, image_url, frame_index, storage_path, created_at)')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (productId) query = query.eq('product_id', productId) as typeof query

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/spin-packages]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ packages: data })
}

// ─── POST /api/spin-packages ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const user = await resolveStoreUser(req)
  if (!user)                                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { product_id, prompt_text, image_count } = body

  if (typeof product_id  !== 'string' || !product_id.trim())
    return NextResponse.json({ error: 'product_id is required' }, { status: 400 })
  if (typeof prompt_text !== 'string' || !prompt_text.trim())
    return NextResponse.json({ error: 'prompt_text is required' }, { status: 400 })

  const count = typeof image_count === 'number' ? Math.round(image_count) : 24
  if (count < 8 || count > 72)
    return NextResponse.json({ error: 'image_count must be between 8 and 72' }, { status: 400 })

  const tenantId = user.role === 'owner'
    ? (typeof body.tenant_id === 'string' ? body.tenant_id : user.tenant_id)
    : user.tenant_id

  const supabase = getSupabaseServerClient()

  // Verify the product belongs to this tenant
  const { data: product, error: productErr } = await supabase
    .from('products')
    .select('id')
    .eq('id', product_id.trim())
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (productErr || !product)
    return NextResponse.json({ error: 'Product not found in this tenant' }, { status: 404 })

  const { data, error } = await supabase
    .from('spin_packages')
    .insert({
      tenant_id:   tenantId,
      product_id:  product_id.trim(),
      prompt_text: prompt_text.trim(),
      image_count: count,
      status:      'draft',
    })
    .select()
    .single()

  if (error) {
    console.error('[POST /api/spin-packages]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ package: data }, { status: 201 })
}
