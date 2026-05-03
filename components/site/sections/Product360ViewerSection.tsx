// components/site/sections/Product360ViewerSection.tsx
// Server component: delegates to the canonical Product360BlockRenderer.

import { Product360BlockRenderer } from '@/components/product-360/Product360BlockRenderer'
import type { Product360ViewerContent } from '@/lib/website/types'

interface Props {
  content:  Partial<Product360ViewerContent>
  tenantId: string
}

export async function Product360ViewerSection({ content, tenantId }: Props) {
  return (
    <section className="w-full py-10 px-4">
      <div className="mx-auto max-w-xl">
        <Product360BlockRenderer
          tenantId={tenantId}
          productId={content.productId}
          packageId={content.packageId}
          autoRotate={content.autoRotate ?? false}
          showControls={content.showControls ?? true}
          showHotspots={content.showHotspots ?? true}
          showLabel={content.showLabel ?? false}
        />
      </div>
    </section>
  )
}
