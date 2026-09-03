'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import type { CinematicConfig, CinematicLayer } from '@/lib/website-cinematic/schema'
import { mapProgressToClip, selectCinematicSource } from '@/lib/website-cinematic/runtime'
import { acquireCinematicSmoothScroll } from './smooth-scroll'

type Props = {
  config: CinematicConfig
  desktopSrc?: string
  mobileSrc?: string
  posterSrc?: string
  manualProgress?: number
  editorMode?: boolean
  previewBreakpoint?: 'desktop' | 'tablet' | 'mobile'
  selectedLayerId?: string
  onSelectLayer?: (layerId: string) => void
  onLayerDragStart?: () => void
  onMoveLayer?: (layerId: string, x: number, y: number) => void
}

const NORMALIZED_DURATION = 1000

function layerTransform(layer: CinematicLayer) {
  const transform = layer.baseTransform
  return `translate3d(-50%, -50%, 0) translate3d(${transform.x ?? 0}px, ${transform.y ?? 0}px, 0) scale(${transform.scale ?? 1}) rotate(${transform.rotation ?? 0}deg)`
}

function Layer({
  layer,
  breakpoint,
  animated,
  selected,
  onPointerDown,
}: {
  layer: CinematicLayer
  breakpoint: 'desktop' | 'tablet' | 'mobile'
  animated: boolean
  selected: boolean
  onPointerDown?: React.PointerEventHandler<HTMLElement>
}) {
  if (layer.hidden || !layer.visibleOn.includes(breakpoint)) return null
  const common: React.CSSProperties = {
    position: 'absolute',
    left: `${layer.x}%`,
    top: `${layer.y}%`,
    width: `${layer.width}%`,
    zIndex: layer.zIndex,
    color: layer.color,
    opacity: layer.baseTransform.opacity ?? 1,
    filter: `blur(${layer.baseTransform.blur ?? 0}px)`,
    transform: layerTransform(layer),
    transformOrigin: 'center',
    willChange: animated ? 'transform, opacity' : undefined,
    textAlign: layer.textAlign,
    outline: selected ? '1px solid rgba(216,183,105,.9)' : undefined,
    outlineOffset: selected ? 4 : undefined,
    cursor: onPointerDown ? 'move' : undefined,
  }
  const attributes = { 'data-cinematic-layer': layer.id, style: common, onPointerDown }
  if ((layer.type === 'image' || layer.type === 'svg') && !layer.src) {
    return <div {...attributes} aria-hidden="true" />
  }
  if (layer.type === 'image') {
    return (
      <Image
        {...attributes}
        src={layer.src!}
        alt={layer.decorative ? '' : layer.alt}
        aria-hidden={layer.decorative || undefined}
        style={{ ...common, objectFit: layer.fit }}
        width={1600}
        height={900}
        unoptimized
      />
    )
  }
  if (layer.type === 'svg') {
    // SVG uploads are served as images; arbitrary markup is never injected.
    return (
      <Image
        {...attributes}
        src={layer.src!}
        alt={layer.decorative ? '' : layer.alt}
        aria-hidden={layer.decorative || undefined}
        width={1600}
        height={900}
        unoptimized
      />
    )
  }
  if (layer.type === 'shape')
    return (
      <div
        {...attributes}
        aria-hidden="true"
        style={{
          ...common,
          aspectRatio: '1',
          borderRadius: '50%',
          background: layer.color,
          boxShadow: `0 0 90px color-mix(in srgb, ${layer.color} 42%, transparent)`,
        }}
      />
    )
  if (layer.type === 'button')
    return (
      <a
        {...attributes}
        href={layer.href || '#'}
        style={{
          ...common,
          display: 'inline-flex',
          width: 'auto',
          padding: '.8rem 1.15rem',
          borderRadius: 999,
          background: layer.color,
          color: '#09090b',
          fontSize: layer.fontSize,
          fontWeight: 750,
          textDecoration: 'none',
        }}
      >
        {layer.content}
      </a>
    )
  if (layer.type === 'heading')
    return (
      <h2
        {...attributes}
        style={{
          ...common,
          margin: 0,
          fontSize: `clamp(2rem, ${layer.fontSize / 12}vw, ${layer.fontSize}px)`,
          lineHeight: 0.94,
          letterSpacing: '-.055em',
        }}
      >
        {layer.content}
      </h2>
    )
  if (layer.type === 'paragraph')
    return (
      <p
        {...attributes}
        style={{ ...common, margin: 0, fontSize: layer.fontSize, lineHeight: 1.5 }}
      >
        {layer.content}
      </p>
    )
  return <div {...attributes}>{layer.content}</div>
}

export function CinematicRenderer({
  config,
  desktopSrc,
  mobileSrc,
  posterSrc,
  manualProgress,
  editorMode = false,
  previewBreakpoint,
  selectedLayerId,
  onSelectLayer,
  onLayerDragStart,
  onMoveLayer,
}: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const timelineRef = useRef<{ progress(value: number): unknown } | null>(null)
  const applyProgressRef = useRef<(progress: number) => void>(() => undefined)
  const manualProgressRef = useRef(manualProgress)
  manualProgressRef.current = manualProgress
  const activeClipRef = useRef(-1)
  const [near, setNear] = useState(editorMode)
  const [mobile, setMobile] = useState(false)
  const [tablet, setTablet] = useState(false)
  const [reduced, setReduced] = useState(false)
  const video = config.video
  const clips = useMemo(() => {
    if (video?.clips.length) return video.clips
    return desktopSrc
      ? [
          {
            id: 'processed',
            desktopSrc,
            mobileSrc,
            poster: posterSrc,
            duration: 1,
            scrollWeight: 1,
            seamOverlap: 0.015,
          },
        ]
      : []
  }, [desktopSrc, mobileSrc, posterSrc, video?.clips])
  const selectedSrc = clips[0]
    ? mobile
      ? clips[0].mobileSrc || clips[0].desktopSrc
      : clips[0].desktopSrc
    : undefined
  const manualMode = manualProgress != null
  const activeBreakpoint = previewBreakpoint ?? (mobile ? 'mobile' : tablet ? 'tablet' : 'desktop')
  const beginLayerDrag = (layerId: string): React.PointerEventHandler<HTMLElement> | undefined =>
    editorMode && onMoveLayer
      ? (event) => {
          event.preventDefault()
          const element = event.currentTarget
          element.setPointerCapture(event.pointerId)
          onSelectLayer?.(layerId)
          onLayerDragStart?.()
          let latest: { x: number; y: number } | null = null
          const move = (next: PointerEvent) => {
            const bounds = stageRef.current?.getBoundingClientRect()
            if (!bounds) return
            latest = {
              x: Math.max(0, Math.min(100, ((next.clientX - bounds.left) / bounds.width) * 100)),
              y: Math.max(0, Math.min(100, ((next.clientY - bounds.top) / bounds.height) * 100)),
            }
            element.style.left = `${latest.x}%`
            element.style.top = `${latest.y}%`
          }
          const stop = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', stop)
            if (latest) onMoveLayer(layerId, latest.x, latest.y)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', stop, { once: true })
        }
      : undefined

  useEffect(() => {
    const media = matchMedia('(max-width: 767px)')
    const tabletMedia = matchMedia('(min-width: 768px) and (max-width: 1023px)')
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => {
      setMobile(media.matches)
      setTablet(tabletMedia.matches)
      setReduced(motion.matches)
    }
    update()
    media.addEventListener('change', update)
    tabletMedia.addEventListener('change', update)
    motion.addEventListener('change', update)
    return () => {
      media.removeEventListener('change', update)
      tabletMedia.removeEventListener('change', update)
      motion.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (editorMode) return
    const root = rootRef.current
    if (!root) return
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && setNear(true), {
      rootMargin: '800px 0px',
    })
    observer.observe(root)
    return () => observer.disconnect()
  }, [editorMode])

  useEffect(() => {
    if (!near || reduced) return
    let disposed = false
    let cleanup: () => void = () => undefined
    void Promise.all([
      import('gsap'),
      import('gsap/ScrollTrigger'),
      import('gsap/MotionPathPlugin'),
    ]).then(([gsapModule, triggerModule, pathModule]) => {
      if (disposed || !rootRef.current || !stageRef.current) return
      const gsap = gsapModule.gsap
      const ScrollTrigger = triggerModule.ScrollTrigger
      const MotionPathPlugin = pathModule.MotionPathPlugin
      gsap.registerPlugin(ScrollTrigger, MotionPathPlugin)
      let releaseSmoothScroll: (() => void) | undefined
      if (config.section.smoothScroll && !editorMode) {
        void acquireCinematicSmoothScroll(() => ScrollTrigger.update()).then((release) => {
          if (disposed) release()
          else releaseSmoothScroll = release
        })
      }
      const context = gsap.context(() => {
        const timeline = gsap.timeline({ paused: true, defaults: { ease: 'none' } })
        config.scenes.slice(1).forEach((scene) => {
          timeline.to(
            stageRef.current,
            { backgroundColor: scene.background, duration: 80, ease: 'none' },
            Math.max(0, scene.startProgress * NORMALIZED_DURATION - 40)
          )
        })
        for (const track of config.tracks) {
          if (!track.enabled) continue
          const target = rootRef.current?.querySelector(
            `[data-cinematic-layer="${CSS.escape(track.layerId)}"]`
          )
          if (!target) continue
          const duration = Math.max(
            1,
            (track.endProgress - track.startProgress) * NORMALIZED_DURATION
          )
          const from = {
            ...track.from,
            filter: track.from.blur == null ? undefined : `blur(${track.from.blur}px)`,
          }
          const to = {
            ...track.to,
            filter: track.to.blur == null ? undefined : `blur(${track.to.blur}px)`,
            duration,
            ease: track.easing === 'none' ? 'none' : `${track.easing}.inOut`,
          } as Record<string, unknown>
          delete from.blur
          delete to.blur
          if (track.motionPath) {
            const pathLayer = config.layers.find(
              (layer) => layer.id === track.motionPath?.pathLayerId
            )
            if (pathLayer?.path) {
              to.motionPath = {
                path: pathLayer.path,
                align: track.motionPath.align ? pathLayer.path : undefined,
                autoRotate: track.motionPath.align,
                start: track.motionPath.reverse ? 1 : 0,
                end: track.motionPath.reverse ? 0 : 1,
              }
            }
          }
          timeline.fromTo(target, from, to, track.startProgress * NORMALIZED_DURATION)
        }
        timelineRef.current = timeline
        const applyProgress = (progress: number) => {
          timeline.progress(progress)
          const media = videoRef.current
          const mapped = mapProgressToClip(clips, progress)
          if (media && mapped && activeClipRef.current !== mapped.index) {
            activeClipRef.current = mapped.index
            media.src = selectCinematicSource(mapped.clip, mobile)
            media.load()
            if (mapped.next) {
              const preload = document.createElement('video')
              preload.preload = 'metadata'
              preload.src = selectCinematicSource(mapped.next, mobile)
            }
          }
          if (media && mapped && Number.isFinite(media.duration) && media.duration > 0) {
            const target = Math.min(
              media.duration - 0.001,
              Math.max(0, mapped.localProgress * media.duration)
            )
            if (!media.seeking && Math.abs(media.currentTime - target) > 0.012)
              media.currentTime = target
            const seam = mapped.clip.seamOverlap
            const entering = mapped.index > 0 && mapped.localProgress < seam
            const leaving = Boolean(mapped.next) && mapped.localProgress > 1 - seam
            media.style.opacity = entering
              ? String(mapped.localProgress / seam)
              : leaving
                ? String((1 - mapped.localProgress) / seam)
                : '1'
          }
          rootRef.current?.style.setProperty('--cinematic-progress', String(progress))
        }
        applyProgressRef.current = applyProgress
        if (!manualMode) {
          const trigger = ScrollTrigger.create({
            trigger: rootRef.current,
            start: 'top top',
            end: 'bottom bottom',
            scrub: true,
            pin: false,
            snap:
              config.section.snap && config.scenes.length > 1
                ? {
                    snapTo: config.scenes.map((scene) => scene.startProgress),
                    duration: { min: 0.08, max: 0.25 },
                  }
                : undefined,
            onUpdate: (self) => applyProgress(self.progress),
          })
          cleanup = () => {
            trigger.kill()
            releaseSmoothScroll?.()
            context.revert()
            releaseSmoothScroll?.()
            timelineRef.current = null
          }
        } else {
          applyProgress(manualProgressRef.current ?? 0)
          cleanup = () => {
            context.revert()
            timelineRef.current = null
          }
        }
      }, rootRef)
    })
    return () => {
      disposed = true
      cleanup()
    }
  }, [clips, config, editorMode, manualMode, mobile, near, reduced])

  useEffect(() => {
    if (manualProgress != null) applyProgressRef.current(manualProgress)
  }, [manualProgress])

  const fallback = config.accessibility.fallbackImage || posterSrc || clips[0]?.poster
  return (
    <section
      ref={rootRef}
      aria-label={config.accessibility.ariaLabel}
      data-section="cinematic-scroll"
      data-engine={config.engine}
      style={{
        position: 'relative',
        minHeight: reduced || editorMode ? '100svh' : `${config.section.scrollLength}vh`,
        background: config.section.background,
        color: '#fff',
      }}
    >
      <div
        ref={stageRef}
        style={{
          position: config.section.pinned && !reduced && !editorMode ? 'sticky' : 'relative',
          top: 0,
          height: '100svh',
          minHeight: 520,
          overflow: 'hidden',
          isolation: 'isolate',
        }}
      >
        {fallback ? (
          <Image
            src={fallback}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            width={1920}
            height={1080}
            unoptimized
          />
        ) : null}
        {near && selectedSrc && !reduced && config.engine !== 'layers' ? (
          <video
            ref={videoRef}
            src={selectedSrc}
            muted
            playsInline
            preload="metadata"
            poster={fallback}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: video?.fit || 'cover',
              objectPosition: `${video?.focalPoint.x ?? 50}% ${video?.focalPoint.y ?? 50}%`,
            }}
          />
        ) : null}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.38))',
          }}
        />
        {config.layers.map((layer) => (
          <Layer
            key={layer.id}
            layer={layer}
            breakpoint={activeBreakpoint}
            animated={config.tracks.some((track) => track.enabled && track.layerId === layer.id)}
            selected={editorMode && selectedLayerId === layer.id}
            onPointerDown={beginLayerDrag(layer.id)}
          />
        ))}
        {editorMode ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 20,
              border: '1px dashed rgba(255,255,255,.18)',
              pointerEvents: 'none',
            }}
          />
        ) : null}
      </div>
    </section>
  )
}
