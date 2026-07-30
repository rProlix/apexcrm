'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { useSignedDamageImageUrl } from './SignedDamageImage'
import type { DamageImage, DamageItem } from './inspection-types'
import { overlayBoxStyle, resolveDamageOverlayGeometry } from '@/lib/van-damage/overlay-geometry'
import { normalizeDamageSeverity } from '@/lib/van-damage/severity'
import { cn } from '@/lib/utils'

export function DamageOverlayFrame({
  image,
  items,
  businessId,
  alt,
  eager = false,
  overlays = true,
  className,
  imageClassName,
  selectedFindingId,
  onUrl,
  onOpen,
}: {
  image: DamageImage
  items: DamageItem[]
  businessId: string
  alt: string
  eager?: boolean
  overlays?: boolean
  className?: string
  imageClassName?: string
  selectedFindingId?: string | null
  onUrl?: (url: string) => void
  onOpen?: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(eager)
  const { url, error, loading, retry } = useSignedDamageImageUrl({
    imageId: image.id,
    businessId,
    profile: 'medium',
    enabled: nearViewport,
    onUrl,
  })
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [refreshAttempted, setRefreshAttempted] = useState(false)
  const loaded = Boolean(url && loadedUrl === url)
  const resolved = useMemo(
    () =>
      items.map((item, index) => ({
        item,
        index,
        geometry: resolveDamageOverlayGeometry({
          box: item.bounding_box,
          imageId: image.id,
          findingImageId: item.image_id,
          imageWidth: image.width,
          imageHeight: image.height,
          confidence: item.confidence,
        }),
      })),
    [image.height, image.id, image.width, items]
  )
  const valid = resolved.flatMap((entry) =>
    entry.geometry.ok ? [{ item: entry.item, index: entry.index, box: entry.geometry.box }] : []
  )
  const invalidCount = resolved.length - valid.length

  useEffect(() => {
    if (
      nearViewport ||
      !containerRef.current ||
      typeof IntersectionObserver === 'undefined'
    ) {
      if (!nearViewport) setNearViewport(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setNearViewport(true)
          observer.disconnect()
        }
      },
      { rootMargin: '400px 0px' },
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [nearViewport])

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex h-full w-full items-center justify-center overflow-hidden bg-white/[0.025]',
        className
      )}
    >
      {(!loaded || loading) && !error && !renderError && (
        <div
          aria-label="Loading image"
          className="absolute inset-0 animate-pulse bg-gradient-to-r from-white/[.02] via-white/[.07] to-white/[.02]"
        />
      )}
      {url ? (
        <div className="relative inline-block max-h-full max-w-full">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt={alt}
            draggable={false}
            loading={eager ? 'eager' : 'lazy'}
            fetchPriority={eager ? 'high' : 'auto'}
            decoding="async"
            className={cn(
              'block max-h-full max-w-full select-none object-contain transition-opacity duration-200',
              loaded ? 'opacity-100' : 'opacity-0',
              imageClassName
            )}
            onClick={onOpen}
            onLoad={() => {
              setLoadedUrl(url)
              setRenderError(null)
              setRefreshAttempted(false)
            }}
            onError={() => {
              setLoadedUrl(null)
              if (!refreshAttempted) {
                setRefreshAttempted(true)
                void retry()
                return
              }
              setRenderError('The full-size image could not be displayed.')
            }}
          />
          {overlays &&
            valid.map(({ item, index, box }) => (
              <DamageOverlayButton
                key={item.id}
                item={item}
                index={index}
                style={overlayBoxStyle(box)}
                selected={item.id === selectedFindingId}
              />
            ))}
        </div>
      ) : null}
      {(error || renderError) && (
        <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-xs text-white/35">
          <button
            type="button"
            onClick={() => {
              setRefreshAttempted(false)
              setLoadedUrl(null)
              setRenderError(null)
              void retry()
            }}
            className="focus-ring rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-white/70"
          >
            {renderError || 'Image unavailable.'} Retry
          </button>
        </div>
      )}
      {overlays && invalidCount > 0 && (
        <div className="absolute bottom-2 left-2 inline-flex items-center rounded-full border border-amber-300/20 bg-black/60 px-2 py-1 text-[10px] text-amber-100/80 backdrop-blur">
          <AlertTriangle className="mr-1 h-3 w-3" />
          {invalidCount} location{invalidCount === 1 ? '' : 's'} need review
        </div>
      )}
    </div>
  )
}

function DamageOverlayButton({
  item,
  index,
  style,
  selected,
}: {
  item: DamageItem
  index: number
  style: Record<string, string>
  selected: boolean
}) {
  const level = normalizeDamageSeverity(item.severity)
  const review = !item.confidence || item.confidence < 0.65
  const tone =
    review || !level.recognized
      ? 'border-sky-200 bg-sky-200/10 text-sky-50'
      : level.level >= 3
        ? 'border-red-300 bg-red-300/12 text-red-50'
        : level.level === 2
          ? 'border-amber-300 bg-amber-300/13 text-amber-50'
          : 'border-emerald-300 bg-emerald-300/12 text-emerald-50'
  return (
    <button
      type="button"
      aria-current={selected ? 'true' : undefined}
      aria-label={`Finding ${index + 1}: ${item.damage_type?.replaceAll('_', ' ') || 'damage'}, ${item.severity || 'unknown severity'}${review ? ', needs review' : ''}`}
      onClick={(event) => {
        event.stopPropagation()
        window.dispatchEvent(new CustomEvent('van-damage:select-finding', { detail: item.id }))
      }}
      className={cn(
        'focus-ring group absolute z-10 border text-left shadow-[0_0_0_1px_rgba(0,0,0,.45)] transition hover:bg-opacity-25',
        tone,
        selected &&
          'z-20 ring-2 ring-white ring-offset-2 ring-offset-black shadow-[0_0_24px_rgba(255,255,255,.3)]'
      )}
      style={style}
    >
      <span className="absolute -left-px -top-6 rounded-md border border-current bg-black/75 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur">
        #{index + 1} {selected ? 'Selected' : review ? 'Review' : `L${Math.min(3, level.level)}`}
      </span>
    </button>
  )
}
