'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Download, Maximize, Minus, Plus, RotateCcw, X } from 'lucide-react'
import type { DamageItem, ResolvedDamageImage } from './inspection-types'
import { MOTION_TRANSITION } from '@/lib/design-system/motion'
import { DamageOverlayFrame } from './DamageOverlayFrame'

export default function DamageLightbox({
  images,
  items,
  initialIndex,
  overlays,
  onClose,
  onIndexChange,
  businessId,
  origin,
  onRefreshImage,
}: {
  images: ResolvedDamageImage[]
  items: DamageItem[]
  initialIndex: number
  overlays: boolean
  onClose: () => void
  onIndexChange: (index: number) => void
  businessId: string
  origin: { x: number; y: number } | null
  onRefreshImage: (imageId: string, url: string) => void
}) {
  const [index, setIndex] = useState(initialIndex)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const pointerStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)
  const touchStart = useRef<number | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()
  const image = images[index]
  const imageItems = items.filter((item) => item.image_id === image?.id && item.bounding_box)

  const move = useCallback(
    (next: number) => {
      const value = (next + images.length) % images.length
      setIndex(value)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      onIndexChange(value)
    },
    [images.length, onIndexChange]
  )

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowLeft') move(index - 1)
      if (event.key === 'ArrowRight') move(index + 1)
      if (event.key === '+' || event.key === '=') setZoom((value) => Math.min(4, value + 0.25))
      if (event.key === '-') setZoom((value) => Math.max(1, value - 0.25))
      if (event.key === 'Tab' && dialogRef.current) trapFocus(event, dialogRef.current)
    }
    window.addEventListener('keydown', handleKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.requestAnimationFrame(() => closeRef.current?.focus())
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = previousOverflow
    }
  }, [index, move, onClose])

  if (!image) return null

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Inspection image viewer"
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 backdrop-blur-xl"
      style={{
        transformOrigin: origin ? `${origin.x}px ${origin.y}px` : '50% 50%',
      }}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.992 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.995 }}
      transition={MOTION_TRANSITION.overlay}
      onTouchStart={(event) => {
        touchStart.current = event.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(event) => {
        if (touchStart.current == null) return
        const distance =
          (event.changedTouches[0]?.clientX ?? touchStart.current) - touchStart.current
        if (Math.abs(distance) > 55) move(index + (distance < 0 ? 1 : -1))
        touchStart.current = null
      }}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div>
          <p className="text-sm font-medium text-white">
            {index + 1} of {images.length}
          </p>
          <p className="text-xs capitalize text-white/40">
            {image.image_role?.replaceAll('_', ' ') || 'Inspection photo'}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom((value) => Math.max(1, value - 0.25))}
            className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-12 text-center text-xs text-white/45">{Math.round(zoom * 100)}%</span>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom((value) => Math.min(4, value + 0.25))}
            className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            aria-label="Reset view"
            onClick={() => {
              setZoom(1)
              setOffset({ x: 0, y: 0 })
            }}
            className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          {image.url && (
            <a
              aria-label="Download original image"
              href={`/api/van-damage/images/${image.id}/signed-url?businessId=${encodeURIComponent(businessId)}&download=1`}
              className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
            >
              <Download className="h-4 w-4" />
            </a>
          )}
          <button
            aria-label="Enter browser fullscreen"
            onClick={() => document.documentElement.requestFullscreen?.()}
            className="focus-ring rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <Maximize className="h-4 w-4" />
          </button>
          <button
            ref={closeRef}
            aria-label="Close viewer"
            onClick={onClose}
            className="focus-ring ml-2 rounded-lg p-2 text-white/70 hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
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
        onPointerUp={() => {
          pointerStart.current = null
        }}
      >
        <button
          aria-label="Previous image"
          onClick={() => move(index - 1)}
          className="focus-ring absolute left-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-3 text-white/70 hover:bg-black/80 hover:text-white"
        >
          ‹
        </button>
        <div className="flex h-full items-center justify-center p-5 md:p-12">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={image.id}
              initial={reduceMotion ? false : { opacity: 0.72 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MOTION_TRANSITION.feedback}
              className="relative max-h-full max-w-full transition-transform duration-150"
              style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
            >
              <DamageOverlayFrame
                image={image}
                items={imageItems}
                businessId={businessId}
                alt={`Inspection image ${index + 1}`}
                overlays={overlays}
                eager
                imageClassName="max-h-[calc(100dvh-9rem)]"
                onUrl={(url) => onRefreshImage(image.id, url)}
              />
            </motion.div>
          </AnimatePresence>
        </div>
        <button
          aria-label="Next image"
          onClick={() => move(index + 1)}
          className="focus-ring absolute right-3 top-1/2 z-20 -translate-y-1/2 rounded-full border border-white/10 bg-black/50 p-3 text-white/70 hover:bg-black/80 hover:text-white"
        >
          ›
        </button>
      </div>
      <div className="shrink-0 border-t border-white/10 px-4 py-3 text-center text-xs text-white/40">
        {image.width && image.height ? `${image.width} × ${image.height} · ` : ''}
        {image.content_type || 'Unknown format'}
        {image.file_size_bytes ? ` · ${(image.file_size_bytes / 1024 / 1024).toFixed(1)} MB` : ''}
      </div>
    </motion.div>
  )
}

function trapFocus(event: KeyboardEvent, container: HTMLElement) {
  const focusable = Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
    )
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
