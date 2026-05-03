// app/api/public/product-360/route.ts
// Public storefront endpoint. No auth required.
// Returns only enabled, ready, in-promo packages.

import { NextRequest, NextResponse }  from 'next/server'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { isPackagePubliclyVisible }   from '@/lib/product-360/visibility'
import type { P360PublicPayload }     from '@/lib/product-360/types'

export const dynamic = 'force-dynamic'

// GET /api/public/product-360
// Query params: tenant (slug/id), productId
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const tenantParam = searchParams.get('tenant')
  const productId   = searchParams.get('productId')

  if (!tenantParam) return NextResponse.json({ error: 'tenant param required' }, { status: 400 })
  if (!productId)   return NextResponse.json({ error: 'productId param required' }, { status: 400 })

  const supabase = getSupabaseServerClient()

  // Resolve tenant id from slug or id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (supabase as any)
    .from('tenants')
    .select('id')
    .or(`slug.eq.${tenantParam},id.eq.${tenantParam}`)
    .maybeSingle()

  if (!tenant) return NextResponse.json({ packages: [] })
  const tenantId = (tenant as { id: string }).id

  // Fetch ready+enabled packages for this product
  const now = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: packages } = await (supabase as any)
    .from('product_360_packages')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('product_id', productId)
    .eq('status', 'ready')
    .eq('is_enabled', true)
    .or(`promo_starts_at.is.null,promo_starts_at.lte.${now}`)
    .or(`promo_ends_at.is.null,promo_ends_at.gt.${now}`)
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: false })

  if (!packages?.length) return NextResponse.json({ packages: [] })

  // Fetch frames + hotspots for each package
  const payloads: P360PublicPayload[] = []

  for (const pkg of packages as Record<string, unknown>[]) {
    if (!isPackagePubliclyVisible({
      status:         pkg.status          as string,
      is_enabled:     pkg.is_enabled      as boolean,
      promo_starts_at: pkg.promo_starts_at as string | null,
      promo_ends_at:   pkg.promo_ends_at  as string | null,
    })) continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: frames } = await (supabase as any)
      .from('product_360_frames')
      .select('frame_index, angle_degrees, image_url, alt_text')
      .eq('package_id', pkg.id)
      .order('frame_index', { ascending: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: hotspots } = await (supabase as any)
      .from('product_360_hotspots')
      .select('id, frame_index, label, description, x, y, action_type, action_value')
      .eq('package_id', pkg.id)
      .eq('is_enabled', true)

    payloads.push({
      packageId:      pkg.id         as string,
      packageName:    pkg.name       as string,
      slug:           pkg.slug       as string,
      packageType:    pkg.package_type as P360PublicPayload['packageType'],
      coverUrl:       (pkg.cover_frame_url ?? null) as string | null,
      viewerSettings: (pkg.settings ?? {}) as P360PublicPayload['viewerSettings'],
      lightingConfig: (pkg.lighting_config ?? {}) as P360PublicPayload['lightingConfig'],
      cameraConfig:   (pkg.camera_config   ?? {}) as P360PublicPayload['cameraConfig'],
      frames:         (frames ?? []) as P360PublicPayload['frames'],
      hotspots:       (hotspots ?? []) as P360PublicPayload['hotspots'],
    })
  }

  return NextResponse.json({ packages: payloads })
}
