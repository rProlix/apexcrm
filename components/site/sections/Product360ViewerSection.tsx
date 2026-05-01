// components/site/sections/Product360ViewerSection.tsx
//
// Server component: resolves the 360° frame URLs for a product, then hands
// them to the client-side SpinViewer360 (canvas-based drag-to-rotate).
//
// Resolution order:
//   1. If content.packageId is set → load product_360_frames for that package
//   2. Else if content.productId  → load product's active p360_package_id from products table
//   3. Else if product has spin_360_id  → fall back to product_360_spins (JSONB, migration 019)
//   4. Render nothing if no data found

import { getSupabaseServerClient }     from '@/lib/supabase/server'
import SpinViewer360Lazy              from '@/components/SpinViewer360/SpinViewer360Lazy'
import type { Product360ViewerContent } from '@/lib/website/types'

interface Props {
  content:  Partial<Product360ViewerContent>
  tenantId: string
}

export async function Product360ViewerSection({ content, tenantId }: Props) {
  const { productId, packageId, autoRotate, speed, label } = content

  if (!productId && !packageId) return null

  const supabase = getSupabaseServerClient()
  let urls: string[] = []
  let resolvedLabel  = label ?? ''

  // ── Strategy 1: explicit packageId ───────────────────────────────────────
  if (packageId) {
    const { data: frames } = await supabase
      .from('product_360_frames')
      .select('frame_index, image_url')
      .eq('package_id', packageId)
      .order('frame_index')

    if (frames?.length) {
      urls          = frames.map(f => f.image_url)
      resolvedLabel = resolvedLabel || ''
    }
  }

  // ── Strategy 2: product's active p360_package_id ─────────────────────────
  if (!urls.length && productId) {
    const { data: product } = await supabase
      .from('products')
      .select('name, p360_package_id, spin_360_id')
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!resolvedLabel && product?.name) resolvedLabel = product.name

    if (product?.p360_package_id) {
      const { data: frames } = await supabase
        .from('product_360_frames')
        .select('frame_index, image_url')
        .eq('package_id', product.p360_package_id)
        .order('frame_index')

      if (frames?.length) urls = frames.map(f => f.image_url)
    }

    // ── Strategy 3: fall back to product_360_spins JSONB (migration 019) ─
    if (!urls.length && product?.spin_360_id) {
      const { data: spin } = await supabase
        .from('product_360_spins')
        .select('image_urls, name')
        .eq('id', product.spin_360_id)
        .eq('status', 'ready')
        .maybeSingle()

      if (spin?.image_urls && Array.isArray(spin.image_urls)) {
        urls          = (spin.image_urls as string[]).filter(Boolean)
        resolvedLabel = resolvedLabel || (spin.name ?? '')
      }
    }
  }

  if (!urls.length) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-500 text-sm">
        360° viewer — no frames available yet.
      </div>
    )
  }

  return (
    <section className="w-full py-10 px-4">
      <div className="mx-auto max-w-xl">
        <SpinViewer360Lazy
          urls={urls}
          label={resolvedLabel || undefined}
          fps={typeof speed === 'number' ? speed : 18}
          className="w-full"
        />
        {resolvedLabel && (
          <p className="mt-3 text-center text-sm font-medium text-zinc-400">
            {resolvedLabel}
          </p>
        )}
      </div>
    </section>
  )
}
