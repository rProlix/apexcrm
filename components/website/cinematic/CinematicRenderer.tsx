'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import type { CinematicConfig, CinematicLayer } from '@/lib/website-cinematic/schema'
import {
  mapProgressToClip,
  orderCinematicClips,
  resolveCinematicLayer,
  selectCinematicSource,
} from '@/lib/website-cinematic/runtime'
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
  return `translate3d(-50%, -50%, 0) translate3d(${transform.x ?? 0}px, ${transform.y ?? 0}px, 0) scale(${transform.scaleX ?? transform.scale ?? 1}, ${transform.scaleY ?? transform.scale ?? 1}) rotate(${transform.rotation ?? 0}deg) skew(${transform.skewX ?? 0}deg, ${transform.skewY ?? 0}deg)`
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
  const resolved = resolveCinematicLayer(layer, breakpoint)
  if (resolved.hidden || resolved.visible === false || !resolved.visibleOn.includes(breakpoint))
    return null
  const transform = resolved.baseTransform
  const common: React.CSSProperties = {
    position: resolved.positionMode,
    left: `${resolved.x}%`,
    top: `${resolved.y}%`,
    width: `${resolved.width}%`,
    height: resolved.height ? `${resolved.height}%` : undefined,
    maxWidth: resolved.maxWidth,
    aspectRatio: resolved.aspectRatio,
    zIndex: resolved.zIndex,
    color: resolved.color,
    opacity: transform.opacity ?? 1,
    filter: `blur(${transform.blur ?? 0}px) brightness(${transform.brightness ?? 1}) contrast(${transform.contrast ?? 1}) saturate(${transform.saturation ?? 1})`,
    transform: layerTransform(resolved),
    transformOrigin: resolved.transformOrigin,
    willChange: animated ? 'transform, opacity' : undefined,
    textAlign: resolved.textAlign,
    fontFamily: resolved.fontFamily,
    fontWeight: resolved.fontWeight,
    lineHeight: resolved.lineHeight,
    letterSpacing: `${resolved.letterSpacing}em`,
    borderRadius: resolved.borderRadius,
    boxShadow: resolved.shadow,
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
  const pendingSeekRef = useRef<number | null>(null)
  const pendingMetadataProgressRef = useRef<number | null>(null)
  const scheduledProgressRef = useRef<number | null>(null)
  const lastSeekRef = useRef(-1)
  const progressFrameRef = useRef<number | null>(null)
  const [near, setNear] = useState(editorMode)
  const [mobile, setMobile] = useState(false)
  const [tablet, setTablet] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [videoState, setVideoState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const video = config.video
  const clips = useMemo(() => {
    if (video?.clips.length) return orderCinematicClips(video.clips)
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
            order: 0,
            preload: 'metadata' as const,
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
          const desktopOverride = track.breakpointOverrides.desktop ?? {}
          const tabletOverride =
            activeBreakpoint === 'tablet' || activeBreakpoint === 'mobile'
              ? (track.breakpointOverrides.tablet ?? {})
              : {}
          const mobileOverride =
            activeBreakpoint === 'mobile' ? (track.breakpointOverrides.mobile ?? {}) : {}
          const fromValues = {
            ...track.from,
            ...desktopOverride.from,
            ...tabletOverride.from,
            ...mobileOverride.from,
          }
          const toValues = {
            ...track.to,
            ...desktopOverride.to,
            ...tabletOverride.to,
            ...mobileOverride.to,
          }
          const filter = (value: typeof fromValues) =>
            `blur(${value.blur ?? 0}px) brightness(${value.brightness ?? 1}) contrast(${value.contrast ?? 1}) saturate(${value.saturation ?? 1})`
          const from = {
            ...fromValues,
            filter: filter(fromValues),
          }
          const to = {
            ...toValues,
            filter: filter(toValues),
            duration,
            ease: track.easing === 'none' ? 'none' : `${track.easing}.inOut`,
          } as Record<string, unknown>
          delete from.blur
          delete from.brightness
          delete from.contrast
          delete from.saturation
          delete to.blur
          delete to.brightness
          delete to.contrast
          delete to.saturation
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
        const preloads = new Map<string, HTMLVideoElement>()
        const preloadClip = (clip: (typeof clips)[number] | null) => {
          if (!clip) return
          const source = selectCinematicSource(clip, mobile)
          if (preloads.has(source)) return
          for (const [cachedSource, cached] of preloads) {
            if (cachedSource === source) continue
            cached.removeAttribute('src')
            cached.load()
            preloads.delete(cachedSource)
          }
          const preload = document.createElement('video')
          preload.muted = true
          preload.playsInline = true
          preload.preload = clip.preload ?? 'metadata'
          preload.src = source
          preloads.set(source, preload)
        }
        const applyProgress = (progress: number) => {
          timeline.progress(progress)
          const media = videoRef.current
          const mapped = mapProgressToClip(clips, progress)
          let sourceChanged = false
          if (media && mapped && activeClipRef.current !== mapped.index) {
            sourceChanged = true
            activeClipRef.current = mapped.index
            pendingMetadataProgressRef.current = mapped.localProgress
            pendingSeekRef.current = null
            lastSeekRef.current = -1
            setVideoState('loading')
            media.src = selectCinematicSource(mapped.clip, mobile)
            media.load()
            preloadClip(mapped.next)
          }
          if (
            media &&
            mapped &&
            !sourceChanged &&
            Number.isFinite(media.duration) &&
            media.duration > 0
          ) {
            const target = Math.min(
              media.duration - 0.001,
              Math.max(0, mapped.localProgress * media.duration)
            )
            if (Math.abs(target - lastSeekRef.current) > 0.012) {
              if (media.seeking) pendingSeekRef.current = target
              else {
                try {
                  media.currentTime = target
                  lastSeekRef.current = target
                  media.requestVideoFrameCallback?.(() => setVideoState('ready'))
                } catch {
                  pendingSeekRef.current = target
                }
              }
            }
            const seam = mapped.clip.seamOverlap ?? 0.015
            const entering = mapped.index > 0 && mapped.localProgress < seam
            const leaving = Boolean(mapped.next) && mapped.localProgress > 1 - seam
            media.style.opacity = entering
              ? String(mapped.localProgress / seam)
              : leaving
                ? String((1 - mapped.localProgress) / seam)
                : '1'
          } else if (media && mapped) {
            pendingMetadataProgressRef.current = mapped.localProgress
          }
          rootRef.current?.style.setProperty('--cinematic-progress', String(progress))
        }
        const scheduleProgress = (progress: number) => {
          scheduledProgressRef.current = Math.max(0, Math.min(1, progress))
          if (progressFrameRef.current != null) return
          progressFrameRef.current = requestAnimationFrame(() => {
            progressFrameRef.current = null
            const next = scheduledProgressRef.current
            scheduledProgressRef.current = null
            if (next != null) applyProgress(next)
          })
        }
        applyProgressRef.current = scheduleProgress
        if (!manualMode) {
          const trigger = ScrollTrigger.create({
            trigger: rootRef.current,
            start: config.section.start,
            end: config.section.end,
            scrub: config.section.scrub,
            pin: false,
            snap:
              config.section.snap && config.scenes.length > 1
                ? {
                    snapTo: config.scenes.map((scene) => scene.startProgress),
                    duration: { min: 0.08, max: 0.25 },
                  }
                : undefined,
            onUpdate: (self) => scheduleProgress(self.progress),
          })
          let wasBackgrounded = document.hidden
          let resumeFrame = 0
          let settleFrame = 0
          const cancelResume = () => {
            if (resumeFrame) cancelAnimationFrame(resumeFrame)
            if (settleFrame) cancelAnimationFrame(settleFrame)
            resumeFrame = 0
            settleFrame = 0
          }
          const restoreAfterBackground = () => {
            cancelResume()
            resumeFrame = requestAnimationFrame(() => {
              resumeFrame = 0
              settleFrame = requestAnimationFrame(() => {
                settleFrame = 0
                if (disposed || document.hidden) return

                // Mobile browsers can suspend or evict the decoder while a tab is hidden.
                // Refresh scroll measurements, then reload and seek the active clip so the
                // first foreground scroll starts from the current page position.
                ScrollTrigger.refresh()
                ScrollTrigger.update()
                const progress = trigger.progress
                const mapped = mapProgressToClip(clips, progress)
                const media = videoRef.current
                if (media && mapped) {
                  const source = selectCinematicSource(mapped.clip, mobile)
                  media.pause()
                  activeClipRef.current = mapped.index
                  pendingMetadataProgressRef.current = mapped.localProgress
                  pendingSeekRef.current = null
                  lastSeekRef.current = -1
                  setVideoState('loading')
                  if (media.getAttribute('src') !== source) media.src = source
                  media.load()
                  preloadClip(mapped.next)
                }
                scheduleProgress(progress)
              })
            })
          }
          const handleVisibilityChange = () => {
            if (document.hidden) {
              wasBackgrounded = true
              cancelResume()
              videoRef.current?.pause()
              return
            }
            if (!wasBackgrounded) return
            wasBackgrounded = false
            restoreAfterBackground()
          }
          const handlePageHide = () => {
            wasBackgrounded = true
            cancelResume()
            videoRef.current?.pause()
          }
          const handlePageShow = (event: PageTransitionEvent) => {
            if (!event.persisted && !wasBackgrounded) return
            wasBackgrounded = false
            restoreAfterBackground()
          }
          document.addEventListener('visibilitychange', handleVisibilityChange)
          window.addEventListener('pagehide', handlePageHide)
          window.addEventListener('pageshow', handlePageShow)
          const refresh = () => ScrollTrigger.refresh()
          const resizeObserver =
            typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh)
          if (stageRef.current) resizeObserver?.observe(stageRef.current)
          const refreshTimer = window.setTimeout(refresh, 120)
          cleanup = () => {
            window.clearTimeout(refreshTimer)
            cancelResume()
            document.removeEventListener('visibilitychange', handleVisibilityChange)
            window.removeEventListener('pagehide', handlePageHide)
            window.removeEventListener('pageshow', handlePageShow)
            resizeObserver?.disconnect()
            if (progressFrameRef.current != null) cancelAnimationFrame(progressFrameRef.current)
            progressFrameRef.current = null
            trigger.kill()
            releaseSmoothScroll?.()
            context.revert()
            for (const preload of preloads.values()) {
              preload.removeAttribute('src')
              preload.load()
            }
            preloads.clear()
            timelineRef.current = null
            applyProgressRef.current = () => undefined
            activeClipRef.current = -1
            pendingMetadataProgressRef.current = null
            pendingSeekRef.current = null
          }
        } else {
          scheduleProgress(manualProgressRef.current ?? 0)
          cleanup = () => {
            if (progressFrameRef.current != null) cancelAnimationFrame(progressFrameRef.current)
            progressFrameRef.current = null
            context.revert()
            preloads.clear()
            timelineRef.current = null
            applyProgressRef.current = () => undefined
            activeClipRef.current = -1
            pendingMetadataProgressRef.current = null
            pendingSeekRef.current = null
          }
        }
      }, rootRef)
    })
    return () => {
      disposed = true
      cleanup()
    }
  }, [activeBreakpoint, clips, config, editorMode, manualMode, mobile, near, reduced])

  useEffect(() => {
    const media = videoRef.current
    if (!media) return
    const seek = (target: number) => {
      if (!Number.isFinite(media.duration) || media.duration <= 0) return
      const bounded = Math.min(media.duration - 0.001, Math.max(0, target))
      try {
        media.currentTime = bounded
        lastSeekRef.current = bounded
      } catch {
        pendingSeekRef.current = bounded
      }
    }
    const applyMetadataProgress = () => {
      setVideoState('ready')
      const progress = pendingMetadataProgressRef.current
      pendingMetadataProgressRef.current = null
      if (progress != null) seek(progress * media.duration)
    }
    const applyPendingSeek = () => {
      const target = pendingSeekRef.current
      pendingSeekRef.current = null
      if (target != null && Math.abs(target - media.currentTime) > 0.012) seek(target)
    }
    media.addEventListener('loadedmetadata', applyMetadataProgress)
    media.addEventListener('seeked', applyPendingSeek)
    const markReady = () => setVideoState('ready')
    const markError = () => setVideoState('error')
    media.addEventListener('canplay', markReady)
    media.addEventListener('error', markError)
    const metadataTimeout = window.setTimeout(() => {
      if (media.readyState < HTMLMediaElement.HAVE_METADATA) setVideoState('error')
    }, 12_000)
    return () => {
      window.clearTimeout(metadataTimeout)
      media.removeEventListener('loadedmetadata', applyMetadataProgress)
      media.removeEventListener('seeked', applyPendingSeek)
      media.removeEventListener('canplay', markReady)
      media.removeEventListener('error', markError)
    }
  }, [near, reduced, selectedSrc])

  useEffect(() => {
    if (manualProgress != null) applyProgressRef.current(manualProgress)
  }, [manualProgress])

  const fallback = config.accessibility.fallbackImage || posterSrc || clips[0]?.poster
  const scrollLength =
    config.responsive[activeBreakpoint]?.scrollLength ?? config.section.scrollLength
  return (
    <section
      ref={rootRef}
      aria-label={config.accessibility.ariaLabel}
      data-section="cinematic-scroll"
      data-engine={config.engine}
      style={{
        position: 'relative',
        minHeight: reduced || editorMode ? '100svh' : `${scrollLength}vh`,
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
          overflow: config.section.overflow,
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
            preload={clips[0]?.preload ?? 'metadata'}
            poster={fallback}
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit:
                mobile && video?.mobileFit !== 'poster'
                  ? video?.mobileFit || 'cover'
                  : video?.fit || 'cover',
              objectPosition: `${mobile ? (video?.mobileFocalPoint?.x ?? video?.focalPoint.x ?? 50) : (video?.focalPoint.x ?? 50)}% ${mobile ? (video?.mobileFocalPoint?.y ?? video?.focalPoint.y ?? 50) : (video?.focalPoint.y ?? 50)}%`,
              opacity: videoState === 'ready' ? 1 : 0,
              transition: 'opacity 180ms ease-out',
            }}
          />
        ) : null}
        {config.section.loadingIndicator && videoState === 'loading' ? (
          <div
            role="status"
            aria-label="Loading cinematic video"
            className="animate-spin motion-reduce:animate-none"
            style={{
              position: 'absolute',
              right: 20,
              bottom: 20,
              zIndex: 3,
              width: 18,
              height: 18,
              border: '2px solid rgba(255,255,255,.25)',
              borderTopColor: '#fff',
              borderRadius: '50%',
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
