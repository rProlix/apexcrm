'use client'
// components/360-spins/ProductSpin360Section.tsx
// Fetches the active 360° spin for a product and renders the SpinViewer360.
// Used on the customer-facing product detail page.

import { useEffect, useState } from 'react'
import SpinViewer360Lazy       from '@/components/SpinViewer360/SpinViewer360Lazy'

interface Props {
  productId: string
  label?:    string
}

export default function ProductSpin360Section({ productId, label }: Props) {
  const [urls,  setUrls]  = useState<string[] | null>(null)
  const [name,  setName]  = useState<string>('')

  useEffect(() => {
    fetch(`/api/store/products/${productId}/spin-360`)
      .then(r => r.json())
      .then(d => {
        setUrls(d.urls ?? [])
        setName(d.name ?? '')
      })
      .catch(() => setUrls([]))
  }, [productId])

  if (urls === null) return (
    <div className="w-full aspect-square rounded-2xl bg-zinc-950 animate-pulse" />
  )
  if (!urls.length) return null

  return (
    <SpinViewer360Lazy
      urls={urls}
      label={label ?? name}
      sensitivity={3}
    />
  )
}
