'use client'
// components/SpinViewer360/SpinViewer360.tsx
//
// Apple-quality canvas-based 360° product spin viewer.
//
// Features:
//   • Drag to rotate (mouse + touch)
//   • Frame scrubber slider
//   • Autoplay with configurable FPS
//   • Zoom on hover (CSS scale, toggle with Z key or button)
//   • Keyboard arrow support
//   • Skeleton loader with frame-count progress ring
//   • Full-screen toggle
//   • Zero SSR issues (canvas only renders client-side)

import {
  useRef, useEffect, useState, useCallback, memo
} from 'react'
import {
  Play, Pause, Maximize2, Minimize2, RotateCcw, ZoomIn, ZoomOut
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpinViewer360Props {
  /** Ordered array of image URLs (frame 0 = front) */
  urls:        string[]
  /** Optional label shown in the bottom bar */
  label?:      string
  className?:  string
  /** Pixels of pointer travel per frame step (lower = faster). Default: 4 */
  sensitivity?: number
  /** Autoplay frames per second. Default: 18 */
  fps?:        number
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_SENSITIVITY = 4
const DEFAULT_FPS         = 18

// ─── Preload helper ───────────────────────────────────────────────────────────

function preloadImages(
  urls:       string[],
  onProgress: (loaded: number) => void,
): Promise<HTMLImageElement[]> {
  const images: HTMLImageElement[] = []
  let loaded = 0

  return new Promise(resolve => {
    if (!urls.length) { resolve([]); return }

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
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle
          cx="48" cy="48" r={r}
          fill="none"
          stroke="white"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
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

// ─── Main component ───────────────────────────────────────────────────────────

function SpinViewer360Raw({
  urls,
  label,
  className = '',
  sensitivity = DEFAULT_SENSITIVITY,
  fps         = DEFAULT_FPS,
}: SpinViewer360Props) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const canvasRef     = useRef<HTMLCanvasElement>(null)

  // Refs used inside event handlers (avoid stale closures)
  const imagesRef     = useRef<HTMLImageElement[]>([])
  const frameRef      = useRef(0)
  const isDragging    = useRef(false)
  const lastX         = useRef(0)
  const accumDelta    = useRef(0)
  const rafId         = useRef(0)
  const autoRafId     = useRef(0)

  // React state (for UI only — not used in the hot path)
  const [loadedCount, setLoadedCount] = useState(0)
  const [isReady,     setIsReady]     = useState(false)
  const [frame,       setFrame]       = useState(0)   // drives scrubber UI
  const [isPlaying,   setIsPlaying]   = useState(false)
  const [isZoomed,    setIsZoomed]    = useState(false)
  const [isFullscreen,setIsFullscreen]= useState(false)
  const [showHint,    setShowHint]    = useState(true)

  const total = urls.length

  // ── Draw ─────────────────────────────────────────────────────────────────
  const drawFrame = useCallback((idx: number) => {
    const canvas = canvasRef.current
    const img    = imagesRef.current[idx]
    if (!canvas || !img || !img.complete) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  }, [])

  const goToFrame = useCallback((idx: number) => {
    const clamped = ((idx % total) + total) % total
    frameRef.current = clamped
    setFrame(clamped)
    drawFrame(clamped)
  }, [total, drawFrame])

  // ── Load images ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!urls.length) return
    setIsReady(false)
    setLoadedCount(0)
    frameRef.current = 0

    preloadImages(urls, count => setLoadedCount(count)).then(images => {
      imagesRef.current = images
      setIsReady(true)
      goToFrame(0)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urls])

  // ── Canvas resize ─────────────────────────────────────────────────────────
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

  // ── Autoplay ──────────────────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimationFrame(autoRafId.current)
    if (!isPlaying || !isReady) return

    const interval  = 1000 / fps
    let lastTime    = 0

    const tick = (time: number) => {
      if (time - lastTime >= interval) {
        const next = (frameRef.current + 1) % total
        frameRef.current = next
        setFrame(next)
        drawFrame(next)
        lastTime = time
      }
      autoRafId.current = requestAnimationFrame(tick)
    }
    autoRafId.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(autoRafId.current)
  }, [isPlaying, isReady, fps, total, drawFrame])

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
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

  // ── Fullscreen ────────────────────────────────────────────────────────────
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

  // ── Drag helpers (shared by mouse + touch) ────────────────────────────────
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
    const delta       = x - lastX.current
    lastX.current     = x
    accumDelta.current += delta

    const steps = Math.trunc(accumDelta.current / sensitivity)
    if (steps === 0) return
    accumDelta.current -= steps * sensitivity

    const next = ((frameRef.current - steps) % total + total) % total
    frameRef.current   = next
    setFrame(next)

    cancelAnimationFrame(rafId.current)
    rafId.current = requestAnimationFrame(() => drawFrame(next))
  }, [total, sensitivity, drawFrame])

  const endDrag = useCallback(() => { isDragging.current = false }, [])

  // ── Mouse events ──────────────────────────────────────────────────────────
  const mouseHandlers = {
    onMouseDown:  (e: React.MouseEvent) => startDrag(e.clientX),
    onMouseMove:  (e: React.MouseEvent) => moveDrag(e.clientX),
    onMouseUp:    endDrag,
    onMouseLeave: endDrag,
  }

  // ── Touch events ──────────────────────────────────────────────────────────
  const touchHandlers = {
    onTouchStart: (e: React.TouchEvent) => startDrag(e.touches[0].clientX),
    onTouchMove:  (e: React.TouchEvent) => {
      e.preventDefault()
      moveDrag(e.touches[0].clientX)
    },
    onTouchEnd: endDrag,
  }

  if (!urls.length) return null

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
        {...mouseHandlers}
        {...touchHandlers}
      />

      {/* Loading overlay */}
      {!isReady && (
        <LoadingRing loaded={loadedCount} total={total} />
      )}

      {/* Drag hint */}
      {isReady && showHint && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full bg-black/50 px-5 py-2.5 backdrop-blur-md text-white/80 text-sm font-medium animate-fade-in">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Drag to rotate
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </div>
        </div>
      )}

      {/* Top bar — badges + controls */}
      {isReady && (
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none">
          {/* 360 badge */}
          <span className="rounded-full bg-black/60 px-3 py-1 text-[11px] font-bold tracking-widest text-white/70 backdrop-blur-sm uppercase">
            360°
          </span>

          {/* Top-right control buttons */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={() => setIsZoomed(z => !z)}
              title={isZoomed ? 'Zoom out (Z)' : 'Zoom in (Z)'}
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
        </div>
      )}

      {/* Bottom bar — scrubber + controls */}
      {isReady && (
        <div
          className="absolute bottom-0 left-0 right-0 flex flex-col gap-2 px-4 pb-4 pt-8"
          style={{
            background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)',
          }}
        >
          {/* Frame scrubber */}
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={total - 1}
              value={frame}
              onChange={e => {
                const v = Number(e.target.value)
                goToFrame(v)
                setIsPlaying(false)
              }}
              className="flex-1 h-1 rounded-full accent-white cursor-pointer"
              style={{ appearance: 'auto' }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Play / Pause */}
              <button
                onClick={() => setIsPlaying(p => !p)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
              </button>

              {/* Reset to frame 0 */}
              <button
                onClick={() => { goToFrame(0); setIsPlaying(false) }}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
                title="Reset"
              >
                <RotateCcw size={13} />
              </button>
            </div>

            {/* Frame counter + label */}
            <div className="text-right">
              {label && (
                <p className="text-[10px] text-white/40 leading-none mb-0.5 truncate max-w-[140px]">{label}</p>
              )}
              <p className="text-[11px] text-white/60 tabular-nums">
                {frame + 1} / {total}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const SpinViewer360 = memo(SpinViewer360Raw)
export default SpinViewer360
