'use client'
// components/360/Product360Viewer.tsx
// Canonical 360° product spin viewer.
//
// Image-sequence based (no Three.js) — reliable, fast, universal.
// Drag left/right (mouse + touch) to rotate through frames.
// Optional auto-rotate, keyboard support, fullscreen, zoom.

import {
  useRef, useEffect, useState, useCallback, memo
} from 'react'
import {
  Play, Pause, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut
} from 'lucide-react'
import type { Product360Frame } from '@/lib/360/types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Product360ViewerProps {
  /** Ordered frames from product_360_frames (sorted by frame_index). */
  frames?:      Pick<Product360Frame, 'frame_index' | 'image_url'>[]
  /** Optional: plain array of image URLs (alternative to frames) */
  urls?:        string[]
  /** Overlay label */
  label?:       string
  className?:   string
  /** Show play/pause, scrubber, zoom, fullscreen controls. Default: true */
  showControls?: boolean
  /** Auto-rotate on mount. Default: false */
  autoRotate?:  boolean
  /** Auto-rotate speed in frames-per-second. Default: 18 */
  speed?:       number
  /** Pixels of pointer travel per one frame step. Default: 4 */
  sensitivity?: number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SENSITIVITY = 4
const DEFAULT_FPS         = 18

// ─── Preload helper ───────────────────────────────────────────────────────────

function preloadImages(
  urls:       string[],
  onProgress: (loaded: number) => void,
): Promise<HTMLImageElement[]> {
  if (!urls.length) return Promise.resolve([])
  const images: HTMLImageElement[] = []
  let loaded = 0
  return new Promise(resolve => {
    urls.forEach((src, i) => {
      const img    = new window.Image()
      img.src      = src
      img.decoding = 'async'
      images[i]    = img
      const done = () => {
        loaded++
        onProgress(loaded)
        if (loaded === urls.length) resolve(images)
      }
      img.onload  = done
      img.onerror = done
    })
  })
}

// ─── Loading ring ─────────────────────────────────────────────────────────────

function LoadingRing({ loaded, total }: { loaded: number; total: number }) {
  const pct    = total > 0 ? loaded / total : 0
  const r      = 38
  const circ   = 2 * Math.PI * r
  const offset = circ * (1 - pct)
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 rounded-2xl">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle
          cx="48" cy="48" r={r}
          fill="none" stroke="white" strokeWidth="4" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          transform="rotate(-90 48 48)"
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
        <text x="48" y="53" textAnchor="middle" fill="white" fontSize="14" fontWeight="600" fontFamily="system-ui">
          {Math.round(pct * 100)}%
        </text>
      </svg>
      <p className="text-white/40 text-xs mt-3 tracking-widest uppercase">
        {loaded} / {total} frames
      </p>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/30">
      <RotateCcw className="h-10 w-10" strokeWidth={1} />
      <p className="text-sm">No frames available</p>
    </div>
  )
}

// ─── Single-image fallback ───────────────────────────────────────────────────

function StaticImage({ src, label }: { src: string; label?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={label ?? '360° product image'}
      className="w-full h-full object-contain rounded-2xl"
      style={{ aspectRatio: '1' }}
    />
  )
}

// ─── Main viewer ──────────────────────────────────────────────────────────────

function Product360ViewerRaw({
  frames       = [],
  urls: urlsProp,  label,
  className      = '',
  showControls   = true,
  autoRotate     = false,
  speed          = DEFAULT_FPS,
  sensitivity    = DEFAULT_SENSITIVITY,
}: Product360ViewerProps) {
  // Resolve URL array (prefer urlsProp, fall back to frames sorted by index)
  const urls = urlsProp?.length
    ? urlsProp
    : [...frames].sort((a, b) => a.frame_index - b.frame_index).map(f => f.image_url)

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const imagesRef    = useRef<HTMLImageElement[]>([])
  const frameRef     = useRef(0)
  const isDragging   = useRef(false)
  const lastX        = useRef(0)
  const accumDelta   = useRef(0)
  const rafId        = useRef(0)
  const autoRafId    = useRef(0)

  const [loadedCount,  setLoadedCount]  = useState(0)
  const [isReady,      setIsReady]      = useState(false)
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying,    setIsPlaying]    = useState(false)
  const [isZoomed,     setIsZoomed]     = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showHint,     setShowHint]     = useState(true)

  const total = urls.length

  // ── Draw ────────────────────────────────────────────────────────────────────
  const drawFrame = useCallback((idx: number) => {
    const canvas = canvasRef.current
    const img    = imagesRef.current[idx]
    if (!canvas || !img?.complete) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }, [])

  const goToFrame = useCallback((idx: number) => {
    const clamped        = ((idx % total) + total) % total
    frameRef.current     = clamped
    setCurrentFrame(clamped)
    drawFrame(clamped)
  }, [total, drawFrame])

  // ── Load images ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!urls.length) return
    setIsReady(false)
    setLoadedCount(0)
    frameRef.current = 0
    preloadImages(urls, count => setLoadedCount(count)).then(images => {
      imagesRef.current = images
      setIsReady(true)
      goToFrame(0)
      if (autoRotate) setIsPlaying(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls.join(',')])

  // ── Canvas resize ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      const canvas = canvasRef.current
      if (!canvas) return
      const w = el.clientWidth
      canvas.width  = w
      canvas.height = w
      drawFrame(frameRef.current)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [drawFrame])

  // ── Autoplay ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(autoRafId.current)
    if (!isPlaying || !isReady || !total) return
    const interval = 1000 / speed
    let lastTime   = 0
    const tick = (time: number) => {
      if (time - lastTime >= interval) {
        const next = (frameRef.current + 1) % total
        frameRef.current = next
        setCurrentFrame(next)
        drawFrame(next)
        lastTime = time
      }
      autoRafId.current = requestAnimationFrame(tick)
    }
    autoRafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(autoRafId.current)
  }, [isPlaying, isReady, speed, total, drawFrame])

  // ── Keyboard ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isReady) return
      if (e.key === 'ArrowLeft')  goToFrame(frameRef.current - 1)
      if (e.key === 'ArrowRight') goToFrame(frameRef.current + 1)
      if (e.key === ' ')          setIsPlaying(p => !p)
      if (e.key === 'z' || e.key === 'Z') setIsZoomed(z => !z)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isReady, goToFrame])

  // ── Fullscreen ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen()
    } else {
      await document.exitFullscreen()
    }
  }, [])

  // ── Drag ────────────────────────────────────────────────────────────────────
  const startDrag = useCallback((x: number) => {
    if (!isReady) return
    isDragging.current  = true
    lastX.current       = x
    accumDelta.current  = 0
    setIsPlaying(false)
    setShowHint(false)
    cancelAnimationFrame(autoRafId.current)
  }, [isReady])

  const moveDrag = useCallback((x: number) => {
    if (!isDragging.current || !total) return
    const delta            = x - lastX.current
    lastX.current          = x
    accumDelta.current    += delta
    const steps = Math.trunc(accumDelta.current / sensitivity)
    if (steps === 0) return
    accumDelta.current    -= steps * sensitivity
    const next = ((frameRef.current - steps) % total + total) % total
    frameRef.current = next
    setCurrentFrame(next)
    cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => drawFrame(next))
  }, [total, sensitivity, drawFrame])

  const endDrag = useCallback(() => { isDragging.current = false }, [])

  // ── Early returns ────────────────────────────────────────────────────────────
  if (!urls.length) return <EmptyState />
  if (urls.length === 1) return <StaticImage src={urls[0]} label={label} />

  return (
    <div
      ref={containerRef}
      className={`relative w-full select-none overflow-hidden rounded-2xl bg-zinc-950 group ${className}`}
      style={{ touchAction: 'none', aspectRatio: '1' }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          cursor:     isDragging.current ? 'grabbing' : 'grab',
          transform:  isZoomed ? 'scale(1.45)' : 'scale(1)',
          transition: 'transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)',
          transformOrigin: 'center center',
        }}
        onMouseDown={e => startDrag(e.clientX)}
        onMouseMove={e => moveDrag(e.clientX)}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onTouchStart={e => startDrag(e.touches[0].clientX)}
        onTouchMove={e => { e.preventDefault(); moveDrag(e.touches[0].clientX) }}
        onTouchEnd={endDrag}
      />

      {/* Loading overlay */}
      {!isReady && <LoadingRing loaded={loadedCount} total={total} />}

      {/* Drag hint */}
      {isReady && showHint && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full bg-black/50 px-5 py-2.5 backdrop-blur-md text-white/80 text-sm font-medium">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Drag to rotate
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
        </div>
      )}

      {/* 360 badge */}
      {isReady && (
        <span className="absolute top-3 left-3 rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold tracking-widest text-white/70 backdrop-blur-sm uppercase">
          360°
        </span>
      )}

      {/* Top-right controls */}
      {isReady && showControls && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          <button
            onClick={() => setIsZoomed(z => !z)}
            title={isZoomed ? 'Zoom out' : 'Zoom in'}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-sm hover:bg-black/80 hover:text-white transition-colors"
          >
            {isZoomed ? <ZoomOut size={14} /> : <ZoomIn size={14} />}
          </button>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white/70 backdrop-blur-sm hover:bg-black/80 hover:text-white transition-colors"
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      )}

      {/* Bottom bar — scrubber + controls */}
      {isReady && showControls && (
        <div
          className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 px-4 pb-4 pt-8"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)' }}
        >
          <input
            type="range" min={0} max={total - 1} value={currentFrame}
            onChange={e => { goToFrame(Number(e.target.value)); setIsPlaying(false) }}
            className="flex-1 h-1 rounded-full accent-white cursor-pointer"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying(p => !p)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                onClick={() => { goToFrame(0); setIsPlaying(false) }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <RotateCcw size={13} />
              </button>
            </div>
            <div className="text-right">
              {label && (
                <p className="text-[10px] text-white/40 leading-none mb-0.5 truncate max-w-[140px]">{label}</p>
              )}
              <p className="text-[11px] text-white/60 tabular-nums">{currentFrame + 1} / {total}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const Product360Viewer = memo(Product360ViewerRaw)
export default Product360Viewer
