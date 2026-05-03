// app/api/360/public/[tenant]/[packageId]/route.ts
// GET /api/360/public/[tenant]/[packageId]
//
// Public storefront endpoint — no authentication required.
// Resolves tenant by slug/subdomain, returns package + frames ONLY if status = 'ready'.
// Never exposes draft/generating/failed packages to the public.

import { NextRequest, NextResponse }  from 'next/server'
import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { getTenantFromHost }          from '@/lib/tenant/getTenantFromHost'

type Params = { params: Promise<{ tenant: string; packageId: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { tenant: tenantSlug, packageId } = await params

  const supabase = getSupabaseServerClient()

  // Resolve tenant by slug (URL param) or host header
  let tenantId: string | null = null

  const { data: tenantRow } = await supabase
    .from('tenants')
    .select('id')
    .or(`slug.eq.${tenantSlug},custom_domain.eq.${tenantSlug}`)
    .maybeSingle()

  if (tenantRow) {
    tenantId = tenantRow.id
  } else {
    // Fallback: resolve from request Host header
    const host       = req.headers.get('host') ?? ''
    const fromHost   = await getTenantFromHost(host)
    if (fromHost) tenantId = fromHost.id
  }

  if (!tenantId) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  // Fetch package — only if ready
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: pkg } = await (supabase as any)
    .from('product_360_packages')
    .select('id, name, frame_count, cover_image_url')
    .eq('id', packageId)
    .eq('tenant_id', tenantId)
    .eq('status', 'ready')
    .maybeSingle()

  if (!pkg) {
    return NextResponse.json({ error: 'Package not found or not ready' }, { status: 404 })
  }

  // Fetch frames
  const { data: frames } = await supabase
    .from('product_360_frames')
    .select('frame_index, angle_degrees, image_url')
    .eq('package_id', packageId)
    .order('frame_index')

  return NextResponse.json({
    packageId:   pkg.id,
    packageName: pkg.name,
    frameCount:  pkg.frame_count,
    coverImage:  pkg.cover_image_url,
    frames:      frames ?? [],
  })
}
