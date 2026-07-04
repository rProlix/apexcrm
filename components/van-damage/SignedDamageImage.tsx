'use client'

import { useEffect, useState } from 'react'
import { ImageIcon } from 'lucide-react'

export function SignedDamageImage({ imageId, businessId, alt }: { imageId: string; businessId: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/van-damage/images/${imageId}/signed-url?businessId=${encodeURIComponent(businessId)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Image unavailable')
        return response.json() as Promise<{ url: string }>
      })
      .then((result) => setUrl(result.url))
      .catch((error) => { if (error?.name !== 'AbortError') setFailed(true) })
    return () => controller.abort()
  }, [imageId, businessId])

  if (!url) return (
    <div className="aspect-video rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center text-white/30">
      <div className="text-center"><ImageIcon className="h-7 w-7 mx-auto mb-2" /><span className="text-xs">{failed ? 'Image not uploaded' : 'Loading image…'}</span></div>
    </div>
  )
  // Signed S3 hosts vary by AWS partition and bucket configuration.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="aspect-video w-full rounded-xl border border-white/10 object-cover" />
}
