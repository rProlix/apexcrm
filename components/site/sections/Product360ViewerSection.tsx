// components/site/sections/Product360ViewerSection.tsx
//
// Server component: resolves 360° frame URLs for a product/package,
// then hands them to the client-side Product360Viewer.
//
// Resolution order:
//   1. If content.packageId is set → load product_360_frames for that package
//   2. Else if content.productId  → load product's active spin_package_id
//   3. If no ready frames found   → render empty fallback

import { getSupabaseServerClient }  from '@/lib/supabase/server'
import Product360ViewerLazy         from '@/components/360/Product360ViewerLazy'
import type { Product360ViewerContent } from '@/lib/website/types'

interface Props {
  content:  Partial<Product360ViewerContent>
  tenantId: string
}

export async function Product360ViewerSection({ content, tenantId }: Props) {
  const { productId, packageId, autoRotate, speed, label } = content

  if (!productId && !packageId) return null

  const supabase      = getSupabaseServerClient()
  let urls: string[]  = []
  let resolvedLabel   = label ?? ''

  // ── Strategy 1: explicit packageId ────────────────────────────────────────
  if (packageId) {
    // Verify package is ready (never show drafts to public)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pkg } = await (supabase as any)
      .from('product_360_packages')
      .select('id, name, status')
      .eq('id', packageId)
      .eq('tenant_id', tenantId)
      .eq('status', 'ready')
      .maybeSingle()

    if (pkg) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: frames } = await (supabase as any)
        .from('product_360_frames')
        .select('frame_index, image_url')
        .eq('package_id', packageId)
        .order('frame_index')

      if (frames?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        urls          = (frames as any[]).map((f: any) => f.image_url as string)
        resolvedLabel = resolvedLabel || (pkg as any).name || ''
      }
    }
  }

  // ── Strategy 2: product's active spin_package_id ──────────────────────────
  if (!urls.length && productId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: product } = await (supabase as any)
      .from('products')
      .select('name, spin_package_id')
      .eq('id', productId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!resolvedLabel && product?.name) resolvedLabel = product.name

    if (product?.spin_package_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: pkg } = await (supabase as any)
        .from('product_360_packages')
        .select('id, status, name')
        .eq('id', product.spin_package_id)
        .eq('status', 'ready')
        .maybeSingle()

      if (pkg) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: frames } = await (supabase as any)
          .from('product_360_frames')
          .select('frame_index, image_url')
          .eq('package_id', product.spin_package_id)
          .order('frame_index')

        if (frames?.length) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          urls          = (frames as any[]).map((f: any) => f.image_url as string)
          resolvedLabel = resolvedLabel || (pkg as any).name || ''
        }
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
        <Product360ViewerLazy
          urls={urls}
          label={resolvedLabel || undefined}
          speed={typeof speed === 'number' ? speed : 18}
          autoRotate={autoRotate ?? false}
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
