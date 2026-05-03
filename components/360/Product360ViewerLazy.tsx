'use client'
// components/360/Product360ViewerLazy.tsx
// Dynamic-import wrapper — prevents canvas code from running during SSR.
// Use this component anywhere a Server Component or page file imports the viewer.

import dynamic from 'next/dynamic'
import type { Product360ViewerProps } from './Product360Viewer'

const Product360Viewer = dynamic<Product360ViewerProps>(
  () => import('./Product360Viewer').then(m => m.Product360Viewer),
  {
    ssr:     false,
    loading: () => (
      <div className="w-full aspect-square rounded-2xl bg-zinc-950 flex flex-col items-center justify-center gap-3 animate-pulse">
        <div className="h-16 w-16 rounded-full border-4 border-white/10" />
        <span className="text-white/20 text-xs tracking-widest uppercase">Loading viewer</span>
      </div>
    ),
  }
)

export default Product360Viewer
