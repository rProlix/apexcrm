'use client'

import Image from 'next/image'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ImageIcon, RefreshCw } from 'lucide-react'
import { getSignedDamageImageUrl, invalidateSignedDamageImageUrl } from '@/lib/van-damage/image-url-cache'

export function useSignedDamageImageUrl({
  imageId,
  businessId,
  enabled = true,
  onUrl,
}: {
  imageId: string
  businessId: string
  enabled?: boolean
  onUrl?: (url: string) => void
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const onUrlRef = useRef(onUrl)
  onUrlRef.current = onUrl

  const load = useCallback(async (forceRefresh = false) => {
    if (!enabled) return
    setLoading(true)
    setError(null)
    try {
      if (forceRefresh) invalidateSignedDamageImageUrl(imageId, businessId)
      const result = await getSignedDamageImageUrl({ imageId, businessId, forceRefresh })
      setUrl(result.url)
      onUrlRef.current?.(result.url)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Image unavailable')
    } finally {
      setLoading(false)
    }
  }, [businessId, enabled, imageId])

  useEffect(() => {
    if (enabled) void load()
  }, [enabled, load])

  return { url, error, loading, retry: () => load(true) }
}

export function SignedDamageImage({
  imageId,
  businessId,
  alt,
  eager = false,
  sizes = '(max-width: 640px) 100vw, 33vw',
  onUrl,
  fillContainer = false,
}: {
  imageId: string
  businessId: string
  alt: string
  eager?: boolean
  sizes?: string
  onUrl?: (url: string) => void
  fillContainer?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)
  const [loaded, setLoaded] = useState(false)
  const [refreshAttempted, setRefreshAttempted] = useState(false)
  const { url, error, retry } = useSignedDamageImageUrl({ imageId, businessId, enabled: visible, onUrl })

  useEffect(() => {
    if (visible || !containerRef.current || typeof IntersectionObserver === 'undefined') {
      if (!visible) setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '300px 0px' })
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [visible])

  return (
    <div ref={containerRef} className={`relative w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] ${fillContainer ? 'h-full' : 'aspect-video'}`}>
      {!loaded && !error && <div aria-label="Loading image" className="absolute inset-0 animate-pulse bg-gradient-to-r from-white/[.02] via-white/[.07] to-white/[.02]" />}
      {url && <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes}
        priority={eager}
        className={`object-cover transition duration-300 ${loaded ? 'opacity-100' : 'scale-[1.02] opacity-0 blur-sm'}`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false)
          if (!refreshAttempted) {
            setRefreshAttempted(true)
            void retry()
          }
        }}
      />}
      {error && <div className="absolute inset-0 flex items-center justify-center p-3 text-white/35">
        <div className="text-center"><ImageIcon className="mx-auto mb-2 h-7 w-7" /><span className="block text-xs">{error}</span><button type="button" onClick={() => { setRefreshAttempted(false); void retry() }} className="focus-ring mt-2 inline-flex items-center rounded-lg border border-white/10 px-2 py-1 text-[10px] text-white/55 hover:bg-white/5"><RefreshCw className="mr-1 h-3 w-3" />Retry</button></div>
      </div>}
    </div>
  )
}
