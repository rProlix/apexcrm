'use client'
// components/product-360/Product360Viewer.tsx
// Premium Three.js 360° product viewer.
//
// Features:
//   - WebGL plane with frame-swapping textures (Three.js)
//   - Smooth drag rotation (mouse + touch) with momentum
//   - Pinch zoom + scroll zoom
//   - Auto-rotate with idle detection
//   - Hotspot overlays
//   - Fullscreen toggle
//   - Loading skeleton + progress bar
//   - Resize observer
//   - Proper Three.js cleanup on unmount

import {
  useEffect, useRef, useState, useCallback, useId,
} from 'react'
import * as THREE from 'three'
import type { P360Frame, P360Hotspot, P360ViewerSettings, P360LightingConfig, P360CameraConfig } from '@/lib/product-360/types'

// ─── Props ────────────────────────────────────────────────────────────────────

export interface Product360ViewerProps {
  frames:          P360Frame[]
  hotspots?:       P360Hotspot[]
  viewerSettings?: P360ViewerSettings
  lightingConfig?: P360LightingConfig
  cameraConfig?:   P360CameraConfig
  initialFrame?:   number
  productName?:    string
  packageName?:    string
  className?:      string
  /** If true, show control buttons overlay */
  showControls?:   boolean
  /** If true, emit package name label */
  showLabel?:      boolean
}

// ─── Internal state ───────────────────────────────────────────────────────────

interface ViewerState {
  renderer:      THREE.WebGLRenderer | null
  scene:         THREE.Scene | null
  camera:        THREE.OrthographicCamera | null
  mesh:          THREE.Mesh | null
  textures:      (THREE.Texture | null)[]
  currentFrame:  number
  totalFrames:   number
  isDragging:    boolean
  dragStartX:    number
  accumDelta:    number
  sensitivity:   number
  animId:        number
  // zoom
  zoom:          number
  minZoom:       number
  maxZoom:       number
  // momentum
  lastVelocity:  number
  momentumId:    number
  // auto-rotate
  autoRotating:  boolean
  autoRotateId:  number
  idleTimer:     ReturnType<typeof setTimeout> | null
  // pinch
  lastPinchDist: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Product360Viewer({
  frames,
  hotspots        = [],
  viewerSettings  = {},
  lightingConfig  = {},
  cameraConfig    = {},
  initialFrame    = 0,
  productName,
  packageName,
  className       = '',
  showControls    = true,
  showLabel       = false,
}: Product360ViewerProps) {
  const containerId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const overlayRef   = useRef<HTMLDivElement>(null)
  const stateRef     = useRef<ViewerState>({
    renderer:     null,
    scene:        null,
    camera:       null,
    mesh:         null,
    textures:     [],
    currentFrame: initialFrame,
    totalFrames:  0,
    isDragging:   false,
    dragStartX:   0,
    accumDelta:   0,
    sensitivity:  viewerSettings.dragSensitivity ?? 4,
    animId:       0,
    zoom:         1,
    minZoom:      cameraConfig.minZoom ?? 0.5,
    maxZoom:      cameraConfig.maxZoom ?? 3,
    lastVelocity: 0,
    momentumId:   0,
    autoRotating: viewerSettings.autoRotate ?? false,
    autoRotateId: 0,
    idleTimer:    null,
    lastPinchDist: 0,
  })

  const [progress,     setProgress]    = useState(0)
  const [isReady,      setIsReady]     = useState(false)
  const [showHint,     setShowHint]    = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [activeHotspot, setActiveHotspot] = useState<P360Hotspot | null>(null)

  const sorted = [...frames].sort((a, b) => a.frame_index - b.frame_index)

  // ── Three.js init ──────────────────────────────────────────────────────────
  const initScene = useCallback(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const w = container.clientWidth  || 400
    const h = container.clientHeight || 400

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h)
    renderer.outputColorSpace = THREE.SRGBColorSpace

    const scene  = new THREE.Scene()
    scene.background = new THREE.Color(viewerSettings.bgColor ?? '#0a0a0a')

    const aspect = w / h
    const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.1, 10)
    camera.position.z = 1

    const geo = new THREE.PlaneGeometry(2 * aspect, 2)
    const mat = new THREE.MeshBasicMaterial({ color: 0x111111 })
    const mesh = new THREE.Mesh(geo, mat)
    scene.add(mesh)

    // Ambient + point light (cosmetic for future 3D models)
    const ambient = new THREE.AmbientLight(0xffffff, lightingConfig.ambientIntensity ?? 0.8)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, lightingConfig.directionalIntensity ?? 0.4)
    dir.position.set(2, 4, 3)
    scene.add(dir)

    const s = stateRef.current
    s.renderer    = renderer
    s.scene       = scene
    s.camera      = camera
    s.mesh        = mesh
    s.totalFrames = sorted.length
    s.currentFrame = Math.min(initialFrame, Math.max(0, sorted.length - 1))
  }, [sorted.length, initialFrame, viewerSettings.bgColor, lightingConfig])

  // ── Texture loading ────────────────────────────────────────────────────────
  const loadTextures = useCallback(async () => {
    const loader = new THREE.TextureLoader()
    const s      = stateRef.current
    s.textures   = new Array(sorted.length).fill(null)

    let loaded = 0
    await Promise.all(
      sorted.map((frame, idx) =>
        new Promise<void>(resolve => {
          loader.load(
            frame.image_url,
            texture => {
              texture.minFilter      = THREE.LinearFilter
              texture.magFilter      = THREE.LinearFilter
              texture.generateMipmaps = false
              texture.colorSpace      = THREE.SRGBColorSpace
              s.textures[idx] = texture
              loaded++
              setProgress(Math.round((loaded / sorted.length) * 100))
              resolve()
            },
            undefined,
            () => { loaded++; setProgress(Math.round((loaded / sorted.length) * 100)); resolve() },
          )
        }),
      ),
    )
  }, [sorted])

  // ── Show frame ─────────────────────────────────────────────────────────────
  const showFrame = useCallback((idx: number) => {
    const s = stateRef.current
    if (!s.mesh) return
    const tex = s.textures[idx]
    if (!tex) return
    const mat = s.mesh.material as THREE.MeshBasicMaterial
    mat.map         = tex
    mat.needsUpdate = true
  }, [])

  // ── Render loop ────────────────────────────────────────────────────────────
  const startRenderLoop = useCallback(() => {
    const s = stateRef.current
    const loop = () => {
      s.animId = requestAnimationFrame(loop)
      if (s.renderer && s.scene && s.camera) {
        s.renderer.render(s.scene, s.camera)
      }
    }
    loop()
  }, [])

  // ── Auto-rotate ────────────────────────────────────────────────────────────
  const startAutoRotate = useCallback(() => {
    const s    = stateRef.current
    const spd  = (viewerSettings.autoRotateSpeed ?? 20) // ms per frame
    let lastTime = performance.now()

    const tick = () => {
      const now   = performance.now()
      if (now - lastTime > spd) {
        lastTime = now
        s.currentFrame = (s.currentFrame + 1) % s.totalFrames
        showFrame(s.currentFrame)
      }
      s.autoRotateId = requestAnimationFrame(tick)
    }
    tick()
  }, [viewerSettings.autoRotateSpeed, showFrame])

  const stopAutoRotate = useCallback(() => {
    cancelAnimationFrame(stateRef.current.autoRotateId)
  }, [])

  const resetIdleTimer = useCallback(() => {
    const s = stateRef.current
    if (!viewerSettings.autoRotate) return
    if (s.idleTimer) clearTimeout(s.idleTimer)
    stopAutoRotate()
    s.idleTimer = setTimeout(() => {
      startAutoRotate()
    }, 3000)
  }, [viewerSettings.autoRotate, startAutoRotate, stopAutoRotate])

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const applyZoom = useCallback((delta: number) => {
    const s = stateRef.current
    if (!s.camera) return
    const newZ = Math.max(s.minZoom, Math.min(s.maxZoom, s.zoom + delta))
    s.zoom = newZ
    ;(s.camera as THREE.OrthographicCamera).zoom = newZ
    s.camera.updateProjectionMatrix()
  }, [])

  // ── Drag handlers ──────────────────────────────────────────────────────────
  const onDragStart = useCallback((clientX: number) => {
    const s        = stateRef.current
    s.isDragging   = true
    s.dragStartX   = clientX
    s.accumDelta   = 0
    s.lastVelocity = 0
    cancelAnimationFrame(s.momentumId)
    stopAutoRotate()
    setShowHint(false)
  }, [stopAutoRotate])

  const onDragMove = useCallback((clientX: number) => {
    const s = stateRef.current
    if (!s.isDragging || s.totalFrames === 0) return

    const delta   = clientX - s.dragStartX
    s.dragStartX  = clientX
    s.accumDelta += delta
    s.lastVelocity = delta

    const steps = Math.round(s.accumDelta / s.sensitivity)
    if (steps === 0) return
    s.accumDelta -= steps * s.sensitivity

    s.currentFrame = ((s.currentFrame - steps) % s.totalFrames + s.totalFrames) % s.totalFrames
    showFrame(s.currentFrame)
  }, [showFrame])

  const onDragEnd = useCallback(() => {
    const s = stateRef.current
    if (!s.isDragging) return
    s.isDragging = false

    // Momentum
    let v = s.lastVelocity
    const decay = () => {
      v *= 0.85
      if (Math.abs(v) < 0.3) return
      s.accumDelta += v
      const steps = Math.round(s.accumDelta / s.sensitivity)
      if (steps !== 0) {
        s.accumDelta -= steps * s.sensitivity
        s.currentFrame = ((s.currentFrame - steps) % s.totalFrames + s.totalFrames) % s.totalFrames
        showFrame(s.currentFrame)
      }
      s.momentumId = requestAnimationFrame(decay)
    }
    if (Math.abs(v) > 1) s.momentumId = requestAnimationFrame(decay)

    resetIdleTimer()
  }, [showFrame, resetIdleTimer])

  // ── Resize ─────────────────────────────────────────────────────────────────
  const handleResize = useCallback(() => {
    const c = containerRef.current
    const s = stateRef.current
    if (!c || !s.renderer || !s.camera) return
    const w = c.clientWidth
    const h = c.clientHeight
    s.renderer.setSize(w, h)
    const aspect = w / h
    const cam    = s.camera as THREE.OrthographicCamera
    cam.left   = -aspect
    cam.right  =  aspect
    cam.updateProjectionMatrix()
    // Update plane geometry
    if (s.mesh) {
      s.mesh.geometry.dispose()
      s.mesh.geometry = new THREE.PlaneGeometry(2 * aspect, 2)
    }
  }, [])

  // ── Fullscreen ─────────────────────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => setIsFullscreen(true))
    } else {
      document.exitFullscreen().catch(() => setIsFullscreen(false))
    }
    setIsFullscreen(f => !f)
  }, [])

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (sorted.length === 0) return

    initScene()
    loadTextures().then(() => {
      showFrame(stateRef.current.currentFrame)
      setIsReady(true)
      startRenderLoop()
      if (viewerSettings.autoRotate) startAutoRotate()
    })

    const ro = new ResizeObserver(handleResize)
    if (containerRef.current) ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      const s = stateRef.current
      cancelAnimationFrame(s.animId)
      cancelAnimationFrame(s.momentumId)
      cancelAnimationFrame(s.autoRotateId)
      if (s.idleTimer) clearTimeout(s.idleTimer)
      s.textures.forEach(t => t?.dispose())
      ;(s.mesh?.material as THREE.MeshBasicMaterial | undefined)?.dispose()
      s.mesh?.geometry.dispose()
      s.renderer?.dispose()
      s.renderer = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length])

  // ── Wheel zoom ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el || !(cameraConfig.enablePan ?? true)) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      applyZoom(-e.deltaY * 0.001)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [applyZoom, cameraConfig.enablePan])

  // ── Visible hotspots for current frame ────────────────────────────────────
  const visibleHotspots = hotspots.filter(h =>
    h.is_enabled &&
    (h.frame_index === null || h.frame_index === stateRef.current.currentFrame)
  )

  if (sorted.length === 0) {
    return (
      <div className={`relative flex items-center justify-center aspect-square rounded-2xl bg-white/4 border border-white/8 ${className}`}>
        <div className="text-center space-y-2">
          <div className="text-white/20 text-4xl">⟳</div>
          <p className="text-xs text-white/30">No frames loaded</p>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      id={containerId}
      className={`relative w-full aspect-square select-none overflow-hidden rounded-2xl bg-[#0a0a0a] ${isFullscreen ? 'fixed inset-0 z-[999] rounded-none aspect-auto h-full' : ''} ${className}`}
      style={{ touchAction: 'none' }}
      // Mouse
      onMouseDown={e => onDragStart(e.clientX)}
      onMouseMove={e => onDragMove(e.clientX)}
      onMouseUp={onDragEnd}
      onMouseLeave={onDragEnd}
      // Touch
      onTouchStart={e => {
        if (e.touches.length === 1) {
          onDragStart(e.touches[0].clientX)
        } else if (e.touches.length === 2) {
          stateRef.current.lastPinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          )
        }
      }}
      onTouchMove={e => {
        e.preventDefault()
        if (e.touches.length === 1) {
          onDragMove(e.touches[0].clientX)
        } else if (e.touches.length === 2) {
          const dist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY,
          )
          const delta = (dist - stateRef.current.lastPinchDist) * 0.005
          stateRef.current.lastPinchDist = dist
          applyZoom(delta)
        }
      }}
      onTouchEnd={onDragEnd}
    >
      {/* WebGL Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Vignette overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{ background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.55) 100%)' }}
      />

      {/* Loading skeleton */}
      {!isReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 gap-4 z-10">
          <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-fuchsia-400 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-white/30 text-xs tracking-widest uppercase">
            Loading frames {progress}%
          </p>
        </div>
      )}

      {/* Hotspots */}
      {isReady && viewerSettings.enableHotspots !== false && visibleHotspots.map(hs => (
        <button
          key={hs.id}
          onClick={() => setActiveHotspot(activeHotspot?.id === hs.id ? null : hs)}
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 group"
          style={{ left: `${hs.x}%`, top: `${hs.y}%` }}
          aria-label={hs.label}
        >
          <div className="w-6 h-6 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center text-xs font-bold text-black animate-pulse group-hover:scale-110 transition-transform">
            ✦
          </div>
          {activeHotspot?.id === hs.id && (
            <div className="absolute left-8 top-0 z-30 w-48 rounded-xl bg-black/90 border border-white/10 p-3 shadow-xl backdrop-blur-sm">
              <p className="text-xs font-semibold text-white mb-1">{hs.label}</p>
              {hs.description && <p className="text-xs text-white/50">{hs.description}</p>}
            </div>
          )}
        </button>
      ))}

      {/* Controls overlay */}
      {isReady && showControls && (
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 z-20">
          {/* Zoom buttons */}
          {(cameraConfig.enablePan ?? true) && (
            <>
              <button
                onClick={() => applyZoom(0.2)}
                className="h-7 w-7 rounded-lg bg-black/60 border border-white/10 text-white/60 hover:text-white text-sm flex items-center justify-center backdrop-blur-sm transition-colors"
                aria-label="Zoom in"
              >+</button>
              <button
                onClick={() => applyZoom(-0.2)}
                className="h-7 w-7 rounded-lg bg-black/60 border border-white/10 text-white/60 hover:text-white text-sm flex items-center justify-center backdrop-blur-sm transition-colors"
                aria-label="Zoom out"
              >−</button>
            </>
          )}
          {/* Reset */}
          <button
            onClick={() => { applyZoom(1 - stateRef.current.zoom); showFrame(0); stateRef.current.currentFrame = 0 }}
            className="h-7 px-2 rounded-lg bg-black/60 border border-white/10 text-white/50 hover:text-white text-xs backdrop-blur-sm transition-colors"
            aria-label="Reset view"
          >⟳</button>
          {/* Fullscreen */}
          {viewerSettings.showFullscreen !== false && (
            <button
              onClick={toggleFullscreen}
              className="h-7 w-7 rounded-lg bg-black/60 border border-white/10 text-white/60 hover:text-white text-sm flex items-center justify-center backdrop-blur-sm transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >{isFullscreen ? '⤡' : '⤢'}</button>
          )}
        </div>
      )}

      {/* Drag hint */}
      {isReady && showHint && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/60 px-4 py-1.5 text-white/50 text-xs backdrop-blur-sm z-20">
          <span>←</span>
          <span>Drag to rotate</span>
          <span>→</span>
        </div>
      )}

      {/* 360° badge */}
      {isReady && (
        <div className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/60 border border-white/10 px-2 py-0.5 text-[10px] font-bold tracking-widest text-white/50 backdrop-blur-sm uppercase z-20">
          360°
        </div>
      )}

      {/* Package label */}
      {isReady && showLabel && packageName && (
        <div className="pointer-events-none absolute top-3 left-3 rounded-full bg-black/60 border border-white/10 px-2 py-0.5 text-[10px] text-white/50 backdrop-blur-sm z-20">
          {packageName}
        </div>
      )}
    </div>
  )
}
