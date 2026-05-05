'use client'
// components/product-360/Product360SequencePreview.tsx
//
// Lightweight image-sequence 360° preview.
//
// Used for:
//   1. IN-PROGRESS preview while frames are still being generated — avoids
//      Three.js entirely so it cannot crash on iOS/Safari/mobile webviews.
//   2. FALLBACK for completed packages when WebGL is unavailable or
//      THREE.WebGLRenderer throws during initialization.
//
// No Three.js dependency. Safe everywhere. Mouse + touch drag-to-rotate.

import { useState, useRef, useCallback, useEffect } from 'react'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Product360SequencePreviewProps {
  /** Ordered array of frame image URLs (only populated/completed frames). */
  frameUrls:         string[]
  /** True while generation is still running. Shows an overlay with progress. */
  isGenerating?:     boolean
  framesCompleted?:  number
  framesTotal?:      number
  className?:        string
  productName?:      string
  /** Pixels of horizontal drag needed to advance one frame. Default: 8 */
  sensitivity?:      number
  /** Auto-spin when idle. Only activates with ≥3 frames. */
  autoSpin?:         boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Product360SequencePreview({
  frameUrls,
  isGenerating  = false,
  framesCompleted,
  framesTotal,
  className     = '',
  productName,
  sensitivity   = 8,
  autoSpin      = false,
}: Product360SequencePreviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isDragging,   setIsDragging]   = useState(false)
  const [showHint,     setShowHint]     = useState(true)

  const dragStartXRef = useRef(0)
  const accumRef      = useRef(0)
  const lastVeloRef   = useRef(0)
  const momentumRef   = useRef(0)
  const autoSpinRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const idleTimerRef  = useRef<ReturnType<typeof setTimeout>  | null>(null)

  const frameCount = frameUrls.length

  // Clamp index when frame list shrinks/resets
  useEffect(() => {
    if (frameCount === 0) {
      setCurrentIndex(0)
    } else {
      setCurrentIndex(i => Math.min(i, frameCount - 1))
    }
  }, [frameCount])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(momentumRef.current)
      if (autoSpinRef.current)  clearInterval(autoSpinRef.current)
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  }, [])

  // Auto-spin logic
  const startAutoSpin = useCallback(() => {
    if (frameCount < 3) return
    autoSpinRef.current = setInterval(() => {
      setCurrentIndex(i => (i + 1) % frameCount)
    }, 80)
  }, [frameCount])

  const stopAutoSpin = useCallback(() => {
    if (autoSpinRef.current) { clearInterval(autoSpinRef.current); autoSpinRef.current = null }
  }, [])

  const resetIdleTimer = useCallback(() => {
    if (!autoSpin) return
    stopAutoSpin()
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    idleTimerRef.current = setTimeout(startAutoSpin, 2500)
  }, [autoSpin, startAutoSpin, stopAutoSpin])

  useEffect(() => {
    if (autoSpin && frameCount >= 3) resetIdleTimer()
    return () => {
      stopAutoSpin()
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSpin, frameCount])

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const onDragStart = useCallback((clientX: number) => {
    if (frameCount === 0) return
    setIsDragging(true)
    setShowHint(false)
    stopAutoSpin()
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
    dragStartXRef.current = clientX
    accumRef.current      = 0
    lastVeloRef.current   = 0
    cancelAnimationFrame(momentumRef.current)
  }, [frameCount, stopAutoSpin])

  const onDragMove = useCallback((clientX: number) => {
    if (!isDragging || frameCount === 0) return
    const delta           = clientX - dragStartXRef.current
    dragStartXRef.current = clientX
    lastVeloRef.current   = delta
    accumRef.current     += delta
    const steps = Math.round(accumRef.current / sensitivity)
    if (steps === 0) return
    accumRef.current -= steps * sensitivity
    setCurrentIndex(i => ((i - steps) % frameCount + frameCount) % frameCount)
  }, [isDragging, frameCount, sensitivity])

  const onDragEnd = useCallback(() => {
    if (!isDragging) return
    setIsDragging(false)
    // Momentum scroll
    let v = lastVeloRef.current
    const decay = () => {
      v *= 0.85
      if (Math.abs(v) < 0.4) { resetIdleTimer(); return }
      accumRef.current += v
      const steps = Math.round(accumRef.current / sensitivity)
      if (steps !== 0) {
        accumRef.current -= steps * sensitivity
        setCurrentIndex(i => ((i - steps) % frameCount + frameCount) % frameCount)
      }
      momentumRef.current = requestAnimationFrame(decay)
    }
    if (Math.abs(v) > 1) {
      momentumRef.current = requestAnimationFrame(decay)
    } else {
      resetIdleTimer()
    }
  }, [isDragging, frameCount, sensitivity, resetIdleTimer])

  // ── Empty state ────────────────────────────────────────────────────────────

  if (frameCount === 0) {
    return (
      <div
        className={`relative flex items-center justify-center aspect-square rounded-2xl bg-white/4 border border-white/8 ${className}`}
        style={{ userSelect: 'none' }}
        aria-label="360° preview loading"
      >
        {isGenerating ? (
          <div className="text-center space-y-3 p-4">
            <div className="w-8 h-8 border-2 border-white/20 border-t-amber-400 rounded-full animate-spin mx-auto" />
            {framesCompleted !== undefined && framesTotal !== undefined ? (
              <p className="text-xs text-white/30">
                Generating {framesCompleted} / {framesTotal} frames…
              </p>
            ) : (
              <p className="text-xs text-white/30">Starting generation…</p>
            )}
          </div>
        ) : (
          <div className="text-center space-y-2">
            <div className="text-white/20 text-4xl">⟳</div>
            <p className="text-xs text-white/30">No frames available</p>
          </div>
        )}
      </div>
    )
  }

  // ── Frame display ──────────────────────────────────────────────────────────

  const safeIndex  = Math.min(currentIndex, frameCount - 1)
  const currentUrl = frameUrls[safeIndex]

  return (
    <div
      className={`relative w-full aspect-square rounded-2xl overflow-hidden bg-[#0a0a0a] select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab'} ${className}`}
      style={{ touchAction: 'none' }}
      aria-label={`360° product preview — frame ${safeIndex + 1} of ${frameCount}`}
      // Mouse
      onMouseDown={e => onDragStart(e.clientX)}
      onMouseMove={e => onDragMove(e.clientX)}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
      // Touch
      onTouchStart={e => { if (e.touches.length === 1) onDragStart(e.touches[0].clientX) }}
      onTouchMove={e  => { e.preventDefault(); if (e.touches.length === 1) onDragMove(e.touches[0].clientX) }}
      onTouchEnd={onDragEnd}
    >
      {/* Frame image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={currentUrl}
        alt={productName ? `${productName} — 360° frame ${safeIndex + 1}` : `360° frame ${safeIndex + 1}`}
        className="absolute inset-0 w-full h-full object-contain pointer-events-none"
        draggable={false}
      />

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%)' }}
      />

      {/* Generation progress overlay */}
      {isGenerating && (
        <div className="pointer-events-none absolute top-2 left-2 right-2 flex items-center gap-2 rounded-xl bg-black/75 backdrop-blur-sm px-3 py-2 z-10">
          <div className="w-3 h-3 border border-white/30 border-t-amber-400 rounded-full animate-spin shrink-0" aria-hidden />
          <p className="text-[10px] text-white/60 font-medium truncate">
            {framesCompleted !== undefined && framesTotal !== undefined
              ? `Generating ${framesCompleted} / ${framesTotal} frames`
              : 'Generating…'}
          </p>
        </div>
      )}

      {/* Drag hint */}
      {!isDragging && showHint && frameCount > 1 && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 px-4 py-1.5 text-white/40 text-xs backdrop-blur-sm z-10 whitespace-nowrap">
          <span aria-hidden>←</span>
          <span>Drag to rotate</span>
          <span aria-hidden>→</span>
        </div>
      )}

      {/* Frame counter */}
      {frameCount > 1 && (
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 border border-white/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/40 backdrop-blur-sm z-10">
          {safeIndex + 1}/{frameCount}
        </div>
      )}

      {/* 360° badge */}
      <div className="pointer-events-none absolute top-2 right-2 rounded-full bg-black/60 border border-white/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/40 backdrop-blur-sm z-10">
        360°
      </div>
    </div>
  )
}

export default Product360SequencePreview
