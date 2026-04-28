'use client'
// components/spin-packages/ProductSpinSection.tsx
// Fetches spin images for a product and renders the SpinViewer.
// Used on the customer-facing product detail page.

import { useEffect, useState } from 'react'
import SpinViewerLazy           from '@/components/spin-viewer/SpinViewerLazy'

interface SpinFrame {
  frame_index: number
  url:         string
}

interface Props {
  productId: string
}

export default function ProductSpinSection({ productId }: Props) {
  const [frames, setFrames] = useState<SpinFrame[] | null>(null)

  useEffect(() => {
    fetch(`/api/store/products/${productId}/spin`)
      .then(r => r.json())
      .then(d => setFrames(d.images ?? []))
      .catch(() => setFrames([]))
  }, [productId])

  if (frames === null) return null          // still loading — show nothing
  if (frames.length === 0) return null       // no spin data — fallback to static image

  return (
    <div className="w-full space-y-2">
      <SpinViewerLazy images={frames} />
      <p className="text-center text-xs text-zinc-500">
        Drag left or right to rotate the product 360°
      </p>
    </div>
  )
}
