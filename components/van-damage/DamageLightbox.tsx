'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, Maximize, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { getSignedDamageImageUrl } from '@/lib/van-damage/image-url-cache'
import type { DamageItem, ResolvedDamageImage } from './inspection-types'

export default function DamageLightbox({
  images,
  items,
  initialIndex,
  overlays,
  onClose,
  onIndexChange,
  businessId,
  onRefreshImage,
}: {
  images: ResolvedDamageImage[]
  items: DamageItem[]
  initialIndex: number
  overlays: boolean
  onClose: () => void
  onIndexChange: (index: number) => void
  businessId: string
  onRefreshImage: (imageId: string, url: string) => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const pointerStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const touchStart = useRef<number | null>(null)
  const image = images[index]
  const imageItems = items.filter((item) => item.image_id === image?.id && item.bounding_box)

  const move = useCallback((next: number) => {
    const value = (next + images.length) % images.length
    setIndex(value)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    onIndexChange(value)
  }, [images.length, onIndexChange])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') move(index - 1)
      if (event.key === 'ArrowRight') move(index + 1)
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(4, value + .25))
      if (event.key === '-') setZoom((value) => Math.max(1, value - .25))
    }
    window.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [index, move, onClose])

  if (!image) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Inspection image viewer"
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl"
      onTouchStart={(event) => { touchStart.current = event.touches[0]?.clientX ?? null }}
      onTouchEnd={(event) => {
        if (touchStart.current == null) return
        const distance = (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current
        if (Math.abs(distance) > 55) move(index + (distance < 0 ? 1 : -1))
        touchStart.current = null
      }}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div>
          <p className="text-sm font-medium text-white">{index + 1} of {images.length}</p>
          <p className="text-xs capitalize text-white/40">{image.image_role?.replaceAll('_', ' ') || 'Inspection photo'}</p>
        </div>
        <div className="flex items-center gap-1">
          <button aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - .25))} className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"><Minus className="h-4 w-4" /></button>
          <span className="w-12 text-center text-xs text-white/45">{Math.round(zoom * 100)}%</span>
          <button aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(4, value + .25))} className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"><Plus className="h-4 w-4" /></button>
          <button aria-label="Reset view" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }) }} className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"><RotateCcw className="h-4 w-4" /></button>
          {image.url && <a aria-label="Download original image" href={`/api/van-damage/images/${image.id}/signed-url?businessId=${encodeURIComponent(businessId)}&download=1`} className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"><Download className="h-4 w-4" /></a>}
          <button aria-label="Enter browser fullscreen" onClick={() => document.documentElement.requestFullscreen?.()} className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"><Maximize className="h-4 w-4" /></button>
          <button autoFocus aria-label="Close viewer" onClick={onClose} className="focus-ring ml-2 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
      </div>

      <div
        className="relative min-h-0 flex-1 overflow-hidden"
        onPointerDown={(event) => {
          if (zoom <= 1) return
          pointerStart.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y }
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (!pointerStart.current) return
          setOffset({
            x: pointerStart.current.ox + event.clientX - pointerStart.current.x,
            y: pointerStart.current.oy + event.clientY - pointerStart.current.y,
          })
        }}
        onPointerUp={() => { pointerStart.current = null }}
      >
        <button aria-label="Previous image" onClick={() => move(index - 1)} className="focus-ring absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-3 text-white/70 hover:bg-black/80 hover:text-white">‹</button>
        <div className="flex h-full items-center justify-center p-5 md:p-12">
          <div className="relative max-h-full max-w-full transition-transform duration-150" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}>
            {image.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={image.url} alt={`Inspection image ${index + 1}`} className="max-h-[calc(100dvh-9rem)] max-w-full select-none object-contain" draggable={false} onError={() => {
                void getSignedDamageImageUrl({ imageId: image.id, businessId, forceRefresh: true })
                  .then((result) => onRefreshImage(image.id, result.url))
                  .catch(() => undefined)
              }} />
            ) : <div className="flex h-72 w-96 items-center justify-center rounded-2xl bg-white/5 text-sm text-white/35">Image unavailable</div>}
            {overlays && imageItems.map((item) => {
              const box = item.bounding_box!
              return <button
                key={item.id}
                aria-label={`Select ${item.damage_type?.replaceAll('_', ' ') || 'damage'} annotation in ${item.vehicle_area?.replaceAll('_', ' ') || 'unknown region'}`}
                onClick={() => window.dispatchEvent(new CustomEvent('van-damage:select-finding', { detail: item.id }))}
                className="focus-ring group absolute border-2 border-amber-300 bg-amber-300/15 text-left shadow-[0_0_0_1px_rgba(0,0,0,.5)]"
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
              >
                <div className="absolute bottom-full left-0 mb-1 hidden min-w-44 rounded-lg border border-white/10 bg-graphite-900/95 p-2 text-left text-[10px] shadow-xl group-hover:block">
                  <p className="font-semibold capitalize text-white">{item.damage_type?.replaceAll('_', ' ')}</p>
                  <p className="mt-1 capitalize text-white/55">{item.severity} · {Math.round((item.confidence ?? 0) * 100)}% confidence</p>
                  <p className="mt-1 text-white/35">Box {box.x.toFixed(2)}, {box.y.toFixed(2)}, {box.width.toFixed(2)}, {box.height.toFixed(2)}</p>
                  <p className="mt-1 text-amber-200/80">{item.repair_recommendation}</p>
                </div>
              </button>
            })}
          </div>
        </div>
        <button aria-label="Next image" onClick={() => move(index + 1)} className="focus-ring absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-3 text-white/70 hover:bg-black/80 hover:text-white">›</button>
      </div>
      <div className="shrink-0 border-t border-white/10 px-4 py-3 text-center text-xs text-white/40">
        {image.width && image.height ? `${image.width} × ${image.height} · ` : ''}{image.content_type || 'Unknown format'}{image.file_size_bytes ? ` · ${(image.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
      </div>
    </div>
  )
}
