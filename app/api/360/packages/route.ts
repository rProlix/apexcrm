// app/api/360/packages/route.ts
// GET  /api/360/packages?tenant_id=xxx   — list packages for tenant
// POST /api/360/packages                 — create a new package (draft)

import { NextRequest, NextResponse }  from 'next/server'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { resolve360ApiUser, resolveTenantFor360Request } from '@/lib/360/auth'

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const user = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url      = new URL(req.url)
  const tenantId = resolveTenantFor360Request(user, url.searchParams.get('tenant_id'))
  if (!tenantId) return NextResponse.json({ error: 'Could not resolve tenant' }, { status: 400 })

  const supabase = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: packages, error } = await (supabase as any)
    .from('product_360_packages')
    .select('id, name, description, source_type, prompt, frame_count, status, error_message, cover_image_url, product_id, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[GET /api/360/packages]', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!packages?.length) return NextResponse.json({ packages: [] })

  // Enrich with frame counts and product names (two extra queries, avoids N+1)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const packageIds = (packages as any[]).map((p: any) => p.id as string)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const productIds = [...new Set((packages as any[]).map((p: any) => p.product_id as string | null).filter(Boolean))] as string[]

  const [{ data: frameCounts }, { data: products }] = await Promise.all([
    supabase
      .from('product_360_frames')
      .select('package_id')
      .in('package_id', packageIds),
    productIds.length
      ? supabase.from('products').select('id, name').in('id', productIds)
      : Promise.resolve({ data: [] }),
  ])

  const countMap   = new Map<string, number>()
  const productMap = new Map<string, string>()

  for (const row of frameCounts ?? []) {
    countMap.set(row.package_id, (countMap.get(row.package_id) ?? 0) + 1)
  }
  for (const p of products ?? []) {
    productMap.set(p.id, p.name)
  }

  const result = (packages as any[]).map((pkg: any) => ({
    ...pkg,
    frames_done:  countMap.get(pkg.id as string) ?? 0,
    product_name: pkg.product_id ? (productMap.get(pkg.product_id as string) ?? null) : null,
  }))

  return NextResponse.json({ packages: result })
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const user = await resolve360ApiUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'owner' && user.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const tenantId = resolveTenantFor360Request(user, body.tenantId as string | null)
  if (!tenantId) return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })

  const name = typeof body.name === 'string' && body.name.trim()
    ? body.name.trim()
    : 'Untitled 360 Package'

  const frameCount = typeof body.frameCount === 'number'
    ? Math.round(body.frameCount)
    : 24

  if (frameCount < 8 || frameCount > 72)
    return NextResponse.json({ error: 'frameCount must be 8–72' }, { status: 400 })

  const sourceType = body.sourceType === 'ai' ? 'ai' : 'manual'

  const supabase = getSupabaseServerClient()

  // Verify product belongs to tenant (if provided)
  let productId: string | null = null
  if (typeof body.productId === 'string' && body.productId.trim()) {
    productId = body.productId.trim()
    const { data: product } = await supabase
      .from('products')
      .select('id')
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!product) return NextResponse.json({ error: 'Product not found in this tenant' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkg, error } = await (supabase as any)
    .from('product_360_packages')
    .insert({
      tenant_id:   tenantId,
      product_id:  productId,
      name,
      description: typeof body.description === 'string' ? body.description.trim() || null : null,
      prompt:      typeof body.prompt === 'string'      ? body.prompt.trim()      || null : null,
      source_type: sourceType,
      frame_count: frameCount,
      status:      'draft',
      settings:    {},
    })
    .select()
    .single()

  if (error || !pkg) {
    console.error('[POST /api/360/packages]', error?.message)
    return NextResponse.json({ error: error?.message ?? 'Failed to create package' }, { status: 500 })
  }

  return NextResponse.json({ package: pkg }, { status: 201 })
}
