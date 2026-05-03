'use client'
// components/product-360/Product360ViewerClient.tsx
// SSR-safe dynamic import wrapper for Product360Viewer.
// Use this in server components or anywhere SSR could run.

import dynamic from 'next/dynamic'
import type { Product360ViewerProps } from './Product360Viewer'

const Product360ViewerDynamic = dynamic(
  () => import('./Product360Viewer').then(m => m.Product360Viewer),
  {
    ssr: false,
    loading: () => (
      <div className="relative w-full aspect-square rounded-2xl bg-white/4 border border-white/8 flex items-center justify-center animate-pulse">
        <div className="text-white/20 text-xs tracking-widest uppercase">360° Loading…</div>
      </div>
    ),
  },
)

export function Product360ViewerClient(props: Product360ViewerProps) {
  return <Product360ViewerDynamic {...props} />
}

export default Product360ViewerClient
