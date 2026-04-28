'use client'
// components/spin-viewer/SpinViewer.tsx
// Reusable 360° product spin viewer built with Three.js.
//
// Renders a flat plane that swaps its texture as the user drags left/right.
// No video — pure frame swapping with cached textures.
//
// Usage:
//   <SpinViewer images={[{ frame_index: 0, url: '...' }, ...]} />

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'

interface SpinFrame {
  frame_index: number
  url:         string
}

interface SpinViewerProps {
  images:      SpinFrame[]
  /** Width/height of the canvas in CSS pixels (defaults to 100% via container) */
  size?:       number
  className?:  string
}

export default function SpinViewer({ images, className = '' }: SpinViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const stateRef     = useRef<{
    renderer:       THREE.WebGLRenderer | null
    scene:          THREE.Scene | null
    camera:         THREE.OrthographicCamera | null
    mesh:           THREE.Mesh | null
    textures:       (THREE.Texture | null)[]
    currentFrame:   number
    totalFrames:    number
    dragStartX:     number
    isDragging:     boolean
    animFrame:      number
    sensitivity:    number
    accumDelta:     number
  }>({
    renderer:     null,
    scene:        null,
    camera:       null,
    mesh:         null,
    textures:     [],
    currentFrame: 0,
    totalFrames:  0,
    dragStartX:   0,
    isDragging:   false,
    animFrame:    0,
    sensitivity:  3,   // pixels of drag per frame step
    accumDelta:   0,
  })

  const [loadingProgress, setLoadingProgress] = useState(0)
  const [isReady,         setIsReady]         = useState(false)
  const [hint,            setHint]            = useState(true)

  // Sort frames by frame_index
  const sorted = [...images].sort((a, b) => a.frame_index - b.frame_index)

  // ── Initialise Three.js scene ──────────────────────────────────────────────
  const initScene = useCallback(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const w = container.clientWidth
    const h = container.clientHeight

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(w, h)

    const scene  = new THREE.Scene()
    scene.background = new THREE.Color(0x111111)

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera.position.z = 1

    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.MeshBasicMaterial({ color: 0x222222 })
    const mesh     = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const s = stateRef.current
    s.renderer    = renderer
    s.scene       = scene
    s.camera      = camera
    s.mesh        = mesh
    s.totalFrames = sorted.length
  }, [sorted.length])

  // ── Load all textures and track progress ─────────────────────────────────
  const loadTextures = useCallback(async () => {
    const loader  = new THREE.TextureLoader()
    const s       = stateRef.current
    s.textures    = new Array(sorted.length).fill(null)

    let loaded = 0
    await Promise.all(
      sorted.map((frame, idx) =>
        new Promise<void>(resolve => {
          loader.load(
            frame.url,
            texture => {
              texture.minFilter = THREE.LinearFilter
              texture.magFilter = THREE.LinearFilter
              texture.generateMipmaps = false
              s.textures[idx] = texture
              loaded++
              setLoadingProgress(Math.round((loaded / sorted.length) * 100))
              resolve()
            },
            undefined,
            () => { loaded++; setLoadingProgress(Math.round((loaded / sorted.length) * 100)); resolve() }
          )
        })
      )
    )
  }, [sorted])

  // ── Swap texture for current frame ────────────────────────────────────────
  const showFrame = useCallback((index: number) => {
    const s       = stateRef.current
    if (!s.mesh)  return
    const texture = s.textures[index]
    if (!texture) return
    ;(s.mesh.material as THREE.MeshBasicMaterial).map = texture
    ;(s.mesh.material as THREE.MeshBasicMaterial).needsUpdate = true
  }, [])

  // ── Render loop ───────────────────────────────────────────────────────────
  const startRenderLoop = useCallback(() => {
    const s = stateRef.current

    const loop = () => {
      s.animFrame = requestAnimationFrame(loop)
      if (s.renderer && s.scene && s.camera) {
        s.renderer.render(s.scene, s.camera)
      }
    }
    loop()
  }, [])

  // ── Handle resize ─────────────────────────────────────────────────────────
  const handleResize = useCallback(() => {
    const container = containerRef.current
    const s         = stateRef.current
    if (!container || !s.renderer || !s.camera) return
    const w = container.clientWidth
    const h = container.clientHeight
    s.renderer.setSize(w, h)
  }, [])

  // ── Pointer / touch helpers ───────────────────────────────────────────────
  const onPointerDown = useCallback((clientX: number) => {
    const s = stateRef.current
    s.isDragging  = true
    s.dragStartX  = clientX
    s.accumDelta  = 0
    setHint(false)
  }, [])

  const onPointerMove = useCallback((clientX: number) => {
    const s = stateRef.current
    if (!s.isDragging || s.totalFrames === 0) return

    const delta = clientX - s.dragStartX
    s.dragStartX = clientX
    s.accumDelta += delta

    const steps = Math.round(s.accumDelta / s.sensitivity)
    if (steps === 0) return

    s.accumDelta -= steps * s.sensitivity
    const newFrame = ((s.currentFrame - steps) % s.totalFrames + s.totalFrames) % s.totalFrames
    s.currentFrame = newFrame
    showFrame(newFrame)
  }, [showFrame])

  const onPointerUp = useCallback(() => {
    stateRef.current.isDragging = false
  }, [])

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sorted.length === 0) return

    initScene()

    loadTextures().then(() => {
      showFrame(0)
      setIsReady(true)
      startRenderLoop()
    })

    window.addEventListener('resize', handleResize)

    return () => {
      const s = stateRef.current
      window.removeEventListener('resize', handleResize)
      cancelAnimationFrame(s.animFrame)
      s.textures.forEach(t => t?.dispose())
      ;(s.mesh?.material as THREE.MeshBasicMaterial | undefined)?.dispose()
      s.mesh?.geometry.dispose()
      s.renderer?.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length])

  // ── Mouse events ──────────────────────────────────────────────────────────
  const mouseHandlers = {
    onMouseDown: (e: React.MouseEvent) => onPointerDown(e.clientX),
    onMouseMove: (e: React.MouseEvent) => onPointerMove(e.clientX),
    onMouseUp:   () => onPointerUp(),
    onMouseLeave:() => onPointerUp(),
  }

  // ── Touch events ─────────────────────────────────────────────────────────
  const touchHandlers = {
    onTouchStart: (e: React.TouchEvent) => onPointerDown(e.touches[0].clientX),
    onTouchMove:  (e: React.TouchEvent) => { e.preventDefault(); onPointerMove(e.touches[0].clientX) },
    onTouchEnd:   () => onPointerUp(),
  }

  if (sorted.length === 0) return null

  return (
    <div
      ref={containerRef}
      className={`relative w-full aspect-square select-none overflow-hidden rounded-xl bg-[#111] ${className}`}
      style={{ touchAction: 'none' }}
      {...mouseHandlers}
      {...touchHandlers}
    >
      <canvas ref={canvasRef} className="w-full h-full" />

      {/* Loading overlay */}
      {!isReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#111]/90 gap-3">
          <div className="w-48 h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-white rounded-full transition-all duration-300"
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <span className="text-white/40 text-xs tracking-widest uppercase">
            Loading {loadingProgress}%
          </span>
        </div>
      )}

      {/* Drag hint */}
      {isReady && hint && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 px-4 py-2 text-white/70 text-xs backdrop-blur-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 12l-4 0M16 12l4 0M8 12l4-4M8 12l4 4" />
          </svg>
          Drag to rotate
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 12l4 0M8 12l-4 0M16 12l-4-4M16 12l-4 4" />
          </svg>
        </div>
      )}

      {/* 360 badge */}
      {isReady && (
        <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[10px] font-bold tracking-widest text-white/60 backdrop-blur-sm uppercase">
          360°
        </div>
      )}
    </div>
  )
}
