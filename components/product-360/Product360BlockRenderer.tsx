// components/product-360/Product360BlockRenderer.tsx
// Server component: resolves package + frames for a product_360_viewer
// website builder block, then renders the client viewer.

import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { isPackagePubliclyVisible }  from '@/lib/product-360/visibility'
import Product360ViewerClient        from './Product360ViewerClient'
import type { P360Frame, P360Hotspot, P360PublicPayload } from '@/lib/product-360/types'

interface Props {
  tenantId:      string
  productId?:    string
  packageId?:    string
  autoRotate?:   boolean
  speed?:        number
  showControls?: boolean
  showHotspots?: boolean
  showLabel?:    boolean
  /** Preview mode (admin builder) — shows draft/disabled packages too */
  previewMode?:  boolean
}

export async function Product360BlockRenderer({
  tenantId,
  productId,
  packageId,
  autoRotate    = false,
  showControls  = true,
  showHotspots  = true,
  showLabel     = false,
  previewMode   = false,
}: Props) {
  if (!productId && !packageId) return null

  const supabase = getSupabaseServerClient()

  let pkg: Record<string, unknown> | null = null
  let frames:   P360Frame[]   = []
  let hotspots: P360Hotspot[] = []

  // ── Resolve package ───────────────────────────────────────────────────────

  if (packageId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from('product_360_packages')
      .select('*')
      .eq('id', packageId)
      .eq('tenant_id', tenantId)
      .maybeSingle()
    pkg = data
  } else if (productId) {
    // Pick default enabled ready package for this product
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q = (supabase as any)
      .from('product_360_packages')
      .select('*')
      .eq('product_id', productId)
      .eq('tenant_id', tenantId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)

    if (!previewMode) {
      q = q.eq('status', 'ready').eq('is_enabled', true)
    }

    const { data } = await q.maybeSingle()
    pkg = data
  }

  if (!pkg) return <ViewerFallback />

  // In public mode, enforce visibility rules
  if (!previewMode && !isPackagePubliclyVisible({
    status:          pkg.status          as string,
    is_enabled:      pkg.is_enabled      as boolean,
    promo_starts_at: pkg.promo_starts_at as string | null,
    promo_ends_at:   pkg.promo_ends_at   as string | null,
  })) {
    return <ViewerFallback />
  }

  // ── Load frames + hotspots ────────────────────────────────────────────────

  const pkgId = pkg.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: framesData } = await (supabase as any)
    .from('product_360_frames')
    .select('*')
    .eq('package_id', pkgId)
    .order('frame_index', { ascending: true })

  frames = (framesData ?? []) as P360Frame[]

  if (showHotspots) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: hotspotsData } = await (supabase as any)
      .from('product_360_hotspots')
      .select('*')
      .eq('package_id', pkgId)
      .eq('is_enabled', true)
    hotspots = (hotspotsData ?? []) as P360Hotspot[]
  }

  if (!frames.length) return <ViewerFallback />

  const settings = (pkg.settings ?? {}) as P360PublicPayload['viewerSettings']
  const lighting = (pkg.lighting_config ?? {}) as P360PublicPayload['lightingConfig']
  const camera   = (pkg.camera_config   ?? {}) as P360PublicPayload['cameraConfig']

  return (
    <Product360ViewerClient
      frames={frames}
      hotspots={hotspots}
      viewerSettings={{ ...settings, autoRotate, enableHotspots: showHotspots }}
      lightingConfig={lighting}
      cameraConfig={camera}
      packageName={pkg.name as string}
      showControls={showControls}
      showLabel={showLabel}
    />
  )
}

function ViewerFallback() {
  return (
    <div className="w-full aspect-square rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center">
      <p className="text-xs text-white/20">360° viewer unavailable</p>
    </div>
  )
}
