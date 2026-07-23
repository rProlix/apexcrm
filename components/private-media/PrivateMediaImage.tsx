'use client'

import Image from 'next/image'
import { ImageIcon, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  getSignedPrivateMediaUrl,
  invalidateSignedPrivateMediaUrl,
} from '@/lib/private-media/url-cache'

export function PrivateMediaImage({
  cacheKey,
  endpoint,
  alt,
  sizes = '(max-width: 640px) 100vw, 33vw',
}: {
  cacheKey: string
  endpoint: string
  alt: string
  sizes?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const retried = useRef(false)
  const requestRef = useRef(0)

  const load = useCallback(async (forceRefresh = false) => {
    const requestId = ++requestRef.current
    setError(null)
    try {
      if (forceRefresh) invalidateSignedPrivateMediaUrl(cacheKey)
      const result = await getSignedPrivateMediaUrl({ cacheKey, endpoint, forceRefresh })
      if (requestRef.current !== requestId) return
      setUrl(result.url)
    } catch (caught) {
      if (requestRef.current !== requestId) return
      setError(caught instanceof Error ? caught.message : 'Media unavailable')
    }
  }, [cacheKey, endpoint])

  useEffect(() => {
    const element = containerRef.current
    if (!element || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '300px 0px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (visible) void load()
    return () => {
      requestRef.current += 1
    }
  }, [load, visible])

  return (
    <div ref={containerRef} className="relative aspect-video overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      {!loaded && !error && <div aria-label="Loading media" className="absolute inset-0 animate-pulse bg-gradient-to-r from-white/[.02] via-white/[.07] to-white/[.02]" />}
      {url && <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes}
        className={`object-cover transition duration-300 ${loaded ? 'opacity-100' : 'scale-[1.02] opacity-0 blur-sm'}`}
        onLoad={() => setLoaded(true)}
        onError={() => {
          setLoaded(false)
          if (!retried.current) {
            retried.current = true
            void load(true)
          } else {
            setError('Media unavailable')
          }
        }}
      />}
      {error && <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-white/35">
        <div><ImageIcon className="mx-auto mb-1 h-5 w-5" />{error}<button type="button" onClick={() => { retried.current = false; void load(true) }} className="mx-auto mt-2 flex items-center rounded border border-white/10 px-2 py-1"><RefreshCw className="mr-1 h-3 w-3" />Retry</button></div>
      </div>}
    </div>
  )
}
