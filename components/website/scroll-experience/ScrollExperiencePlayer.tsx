'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ScrollExperienceContent } from '@/lib/website-scroll-experience/types'
import { mapScrollProgressToTime, shouldUseBlobMode } from '@/lib/website-scroll-experience/runtime'

type Props = {
  content: ScrollExperienceContent
  componentInstanceId: string
  desktopSrc?: string
  mobileSrc?: string
  posterSrc?: string
  interactive: boolean
  analyticsEnabled: boolean
}

const smoothingFactor = { direct: 1, smooth: 0.28, cinematic: 0.12 } as const

function getSessionId() {
  const key = 'nexora_scroll_session'
  try {
    const current = sessionStorage.getItem(key)
    if (current) return current
    const created = crypto.randomUUID()
    sessionStorage.setItem(key, created)
    return created
  } catch {
    return 'session-unavailable'
  }
}

export function ScrollExperiencePlayer({
  content,
  componentInstanceId,
  desktopSrc,
  mobileSrc,
  posterSrc,
  interactive,
  analyticsEnabled,
}: Props) {
  const rootRef = useRef<HTMLElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const beatRefs = useRef<Array<HTMLDivElement | null>>([])
  const progressBarRef = useRef<HTMLSpanElement>(null)
  const scrollHintRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef(0)
  const targetProgressRef = useRef(0)
  const pendingSeekRef = useRef<number | null>(null)
  const lastSeekRef = useRef(-1)
  const firedRef = useRef(new Set<string>())
  const blobUrlRef = useRef<string | null>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [painted, setPainted] = useState(false)
  const [failed, setFailed] = useState(false)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  const selectedSrc = isMobile ? (mobileSrc ?? desktopSrc) : desktopSrc
  const selectedBytes = isMobile
    ? (content.mobileBytes ?? content.desktopBytes)
    : content.desktopBytes
  const sourceMode = shouldUseBlobMode(selectedBytes, 32 * 1024 * 1024) ? 'blob' : 'direct'
  const effectiveInteractive = interactive && !reducedMotion && !failed && Boolean(selectedSrc)

  const sendEvent = useCallback(
    (eventName: string) => {
      if (!analyticsEnabled || !content.experienceVersionId || firedRef.current.has(eventName))
        return
      firedRef.current.add(eventName)
      void fetch(
        `/api/public/scroll-experiences/${encodeURIComponent(content.experienceVersionId)}/events`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          keepalive: true,
          body: JSON.stringify({
            eventName,
            componentInstanceId,
            sessionId: getSessionId(),
            pagePath: location.pathname,
          }),
        }
      ).catch(() => undefined)
    },
    [analyticsEnabled, componentInstanceId, content.experienceVersionId]
  )

  useEffect(() => {
    const motion = matchMedia('(prefers-reduced-motion: reduce)')
    const mobile = matchMedia('(max-width: 860px)')
    const coarse = matchMedia('(hover: none) and (pointer: coarse)')
    const update = () => {
      setReducedMotion(motion.matches)
      setIsMobile(mobile.matches || coarse.matches)
    }
    update()
    motion.addEventListener('change', update)
    mobile.addEventListener('change', update)
    coarse.addEventListener('change', update)
    return () => {
      motion.removeEventListener('change', update)
      mobile.removeEventListener('change', update)
      coarse.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    setPainted(false)
    setFailed(false)
    progressRef.current = 0
    targetProgressRef.current = 0
    pendingSeekRef.current = null
    lastSeekRef.current = -1
  }, [selectedSrc])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNearViewport(true)
          sendEvent('scroll_experience_view')
        }
      },
      { rootMargin: '125% 0px' }
    )
    observer.observe(root)
    return () => observer.disconnect()
  }, [sendEvent])

  useEffect(() => {
    if (!nearViewport || !selectedSrc || sourceMode !== 'blob' || reducedMotion) return
    const controller = new AbortController()
    void fetch(selectedSrc, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('media fetch failed')
        return response.blob()
      })
      .then((blob) => {
        if (controller.signal.aborted) return
        blobUrlRef.current = URL.createObjectURL(blob)
        const video = videoRef.current
        if (video) {
          video.src = blobUrlRef.current
          video.load()
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return
        const video = videoRef.current
        if (video) {
          video.src = selectedSrc
          video.load()
        }
      })
    return () => {
      controller.abort()
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [nearViewport, reducedMotion, selectedSrc, sourceMode])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !effectiveInteractive) return
    const paintSoughtFrame = () => {
      const requestFrame = (
        video as HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number }
      ).requestVideoFrameCallback
      if (requestFrame) requestFrame.call(video, () => setPainted(true))
      else setPainted(true)
    }
    const applyPending = () => {
      paintSoughtFrame()
      const pending = pendingSeekRef.current
      pendingSeekRef.current = null
      if (pending != null && Math.abs(pending - video.currentTime) > 0.015) {
        try {
          video.currentTime = pending
          lastSeekRef.current = pending
        } catch {
          /* transient decoder state */
        }
      }
    }
    const handleError = () => setFailed(true)
    video.addEventListener('seeked', applyPending)
    video.addEventListener('error', handleError, { once: true })
    return () => {
      video.removeEventListener('seeked', applyPending)
      video.removeEventListener('error', handleError)
    }
  }, [effectiveInteractive])

  useEffect(() => {
    if (!effectiveInteractive || !isMobile) return
    const prime = () => {
      const video = videoRef.current
      if (!video) return
      void video
        .play()
        .then(() => video.pause())
        .catch(() => undefined)
    }
    document.addEventListener('pointerdown', prime, { once: true, passive: true })
    document.addEventListener('touchstart', prime, { once: true, passive: true })
    return () => {
      document.removeEventListener('pointerdown', prime)
      document.removeEventListener('touchstart', prime)
    }
  }, [effectiveInteractive, isMobile])

  useEffect(() => {
    if (!effectiveInteractive) return
    let raf = 0
    const loop = () => {
      const root = rootRef.current
      const video = videoRef.current
      if (root && video && Number.isFinite(video.duration) && video.duration > 0) {
        const rect = root.getBoundingClientRect()
        const distance = Math.max(1, root.offsetHeight - innerHeight)
        targetProgressRef.current = Math.max(0, Math.min(1, -rect.top / distance))
        progressRef.current +=
          (targetProgressRef.current - progressRef.current) * smoothingFactor[content.smoothing]
        const desired = mapScrollProgressToTime({
          progress: progressRef.current,
          duration: video.duration,
          startTime: content.startTime,
          endTime: content.endTime,
          reverse: content.direction === 'reverse',
        })
        const seekTarget = Math.min(desired, Math.max(0, video.duration - 0.001))
        const seekTolerance = isMobile ? 0.02 : 0.008
        if (Math.abs(seekTarget - lastSeekRef.current) > seekTolerance) {
          if (video.seeking) pendingSeekRef.current = seekTarget
          else {
            try {
              video.currentTime = seekTarget
              lastSeekRef.current = seekTarget
            } catch {
              /* metadata race */
            }
          }
        }
        beatRefs.current.forEach((element, index) => {
          if (!element) return
          const beat = content.beats[index]
          const visible =
            progressRef.current >= beat.startProgress && progressRef.current <= beat.endProgress
          element.style.opacity = visible ? '1' : '0'
          element.style.transform = visible ? 'translate3d(0,0,0)' : 'translate3d(0,18px,0)'
          element.style.pointerEvents = visible ? 'auto' : 'none'
        })
        if (progressBarRef.current) {
          progressBarRef.current.style.transform = `scaleX(${progressRef.current.toFixed(4)})`
        }
        if (scrollHintRef.current) {
          const hintOpacity = Math.max(0, Math.min(1, 1 - progressRef.current / 0.12))
          scrollHintRef.current.style.opacity = String(hintOpacity)
          scrollHintRef.current.style.transform = `translate3d(-50%, ${progressRef.current * 12}px, 0)`
        }
        if (progressRef.current > 0.01) sendEvent('scroll_experience_started')
        if (progressRef.current >= 0.25) sendEvent('scroll_experience_25')
        if (progressRef.current >= 0.5) sendEvent('scroll_experience_50')
        if (progressRef.current >= 0.75) sendEvent('scroll_experience_75')
        if (progressRef.current >= 0.99) sendEvent('scroll_experience_completed')
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [
    content.beats,
    content.direction,
    content.endTime,
    content.smoothing,
    content.startTime,
    effectiveInteractive,
    isMobile,
    sendEvent,
  ])

  const stageJustify =
    content.contentPosition === 'top'
      ? 'flex-start'
      : content.contentPosition === 'center'
        ? 'center'
        : 'flex-end'
  const objectPosition =
    content.position === 'top'
      ? 'center top'
      : content.position === 'bottom'
        ? 'center bottom'
        : 'center center'
  const overlay = useMemo(() => {
    const alpha = content.overlayOpacity
    if (content.overlayStyle === 'solid') return `rgba(0,0,0,${alpha})`
    if (content.overlayStyle === 'vignette')
      return `radial-gradient(circle at center, transparent 30%, rgba(0,0,0,${Math.min(0.9, alpha + 0.25)}) 100%)`
    return `linear-gradient(180deg, rgba(0,0,0,${alpha * 0.35}) 0%, rgba(0,0,0,${Math.min(0.9, alpha + 0.18)}) 100%)`
  }, [content.overlayOpacity, content.overlayStyle])
  const noAsset = !selectedSrc

  return (
    <section
      ref={rootRef}
      data-section="scroll-experience"
      data-media-mode={sourceMode}
      data-scroll-active={effectiveInteractive ? 'true' : 'false'}
      style={{
        position: 'relative',
        minHeight: effectiveInteractive ? `${content.scrollDistanceVh}vh` : '100svh',
        background: content.backgroundColor,
        color: '#f7f7f5',
      }}
    >
      <div
        style={{ position: 'sticky', top: 0, height: '100svh', minHeight: 520, overflow: 'hidden' }}
      >
        {effectiveInteractive ? (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: '0 0 auto',
              zIndex: 5,
              height: 3,
              background: 'rgba(255,255,255,.14)',
            }}
          >
            <span
              ref={progressBarRef}
              style={{
                display: 'block',
                width: '100%',
                height: '100%',
                transform: 'scaleX(0)',
                transformOrigin: 'left center',
                background: 'rgba(255,255,255,.92)',
                willChange: 'transform',
              }}
            />
          </div>
        ) : null}
        {posterSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterSrc}
            alt=""
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: content.fit,
              objectPosition,
            }}
          />
        ) : null}
        {nearViewport && selectedSrc && !reducedMotion ? (
          <video
            ref={videoRef}
            src={sourceMode === 'direct' ? selectedSrc : undefined}
            poster={posterSrc}
            muted
            playsInline
            preload="metadata"
            controls={false}
            disablePictureInPicture
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: isMobile && content.mobileFit === 'contain' ? 'contain' : content.fit,
              objectPosition,
              opacity: painted ? 1 : 0,
              transition: 'opacity 240ms cubic-bezier(.23,1,.32,1)',
            }}
          />
        ) : null}
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: overlay }} />
        <div
          style={{
            position: 'relative',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: stageJustify,
            alignItems:
              content.textAlign === 'center'
                ? 'center'
                : content.textAlign === 'right'
                  ? 'flex-end'
                  : 'flex-start',
            padding:
              'max(1.5rem, env(safe-area-inset-top)) clamp(1.25rem, 6vw, 6rem) max(1.5rem, env(safe-area-inset-bottom))',
            textAlign: content.textAlign,
          }}
        >
          {noAsset ? (
            <div
              style={{
                maxWidth: 620,
                padding: '1.5rem',
                border: '1px solid rgba(255,255,255,.18)',
                borderRadius: 16,
                background: 'rgba(16,16,19,.82)',
                boxShadow: 'inset 0 1px rgba(255,255,255,.08)',
              }}
            >
              <h2
                style={{
                  margin: 0,
                  fontSize: 'clamp(1.8rem,5vw,3.5rem)',
                  letterSpacing: '-.035em',
                }}
              >
                Create your Scroll Experience
              </h2>
              <p
                style={{
                  margin: '.8rem 0 0',
                  maxWidth: '48ch',
                  color: 'rgba(255,255,255,.72)',
                  lineHeight: 1.55,
                }}
              >
                Upload an MP4 or choose a ready video in the editor.
              </p>
            </div>
          ) : content.beats.length ? (
            content.beats.map((beat, index) => (
              <div
                key={beat.id}
                ref={(node) => {
                  beatRefs.current[index] = node
                }}
                style={{
                  position: 'absolute',
                  insetInline: 'clamp(1.25rem, 6vw, 6rem)',
                  top:
                    beat.position === 'top' ? '12%' : beat.position === 'bottom' ? 'auto' : '50%',
                  bottom: beat.position === 'bottom' ? '12%' : 'auto',
                  transform: 'translate3d(0,18px,0)',
                  opacity: 0,
                  transition:
                    'opacity 240ms cubic-bezier(.23,1,.32,1), transform 240ms cubic-bezier(.23,1,.32,1)',
                  textAlign: beat.alignment ?? content.textAlign,
                }}
              >
                {beat.eyebrow ? (
                  <p
                    style={{
                      margin: '0 0 .75rem',
                      fontSize: '.75rem',
                      letterSpacing: '.14em',
                      textTransform: 'uppercase',
                      color: 'rgba(255,255,255,.74)',
                    }}
                  >
                    {beat.eyebrow}
                  </p>
                ) : null}
                {beat.title ? (
                  <h2
                    style={{
                      margin: 0,
                      maxWidth: 760,
                      fontSize: 'clamp(2.25rem,7vw,5.75rem)',
                      lineHeight: 0.98,
                      letterSpacing: '-.045em',
                    }}
                  >
                    {beat.title}
                  </h2>
                ) : null}
                {beat.body ? (
                  <p
                    style={{
                      margin: '1rem 0 0',
                      maxWidth: '56ch',
                      fontSize: 'clamp(1rem,2vw,1.25rem)',
                      lineHeight: 1.55,
                      color: 'rgba(255,255,255,.8)',
                    }}
                  >
                    {beat.body}
                  </p>
                ) : null}
                {beat.buttonLabel && beat.buttonHref ? (
                  <a
                    href={beat.buttonHref}
                    onClick={() => sendEvent('scroll_experience_cta_clicked')}
                    style={{
                      display: 'inline-flex',
                      marginTop: '1.5rem',
                      padding: '.8rem 1.25rem',
                      borderRadius: 999,
                      background: '#f4f4f2',
                      color: '#171719',
                      fontWeight: 700,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {beat.buttonLabel}
                  </a>
                ) : null}
              </div>
            ))
          ) : (
            <div style={{ maxWidth: 780 }}>
              {content.eyebrow ? (
                <p
                  style={{
                    margin: '0 0 .75rem',
                    fontSize: '.75rem',
                    letterSpacing: '.14em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,.74)',
                  }}
                >
                  {content.eyebrow}
                </p>
              ) : null}
              {content.heading ? (
                <h2
                  style={{
                    margin: 0,
                    fontSize: 'clamp(2.4rem,7vw,6rem)',
                    lineHeight: 0.96,
                    letterSpacing: '-.048em',
                  }}
                >
                  {content.heading}
                </h2>
              ) : null}
              {content.body ? (
                <p
                  style={{
                    margin: '1rem 0 0',
                    maxWidth: '56ch',
                    fontSize: 'clamp(1rem,2vw,1.25rem)',
                    lineHeight: 1.55,
                    color: 'rgba(255,255,255,.8)',
                  }}
                >
                  {content.body}
                </p>
              ) : null}
              {content.buttonLabel && content.buttonHref ? (
                <a
                  href={content.buttonHref}
                  onClick={() => sendEvent('scroll_experience_cta_clicked')}
                  style={{
                    display: 'inline-flex',
                    marginTop: '1.5rem',
                    padding: '.8rem 1.25rem',
                    borderRadius: 999,
                    background: '#f4f4f2',
                    color: '#171719',
                    fontWeight: 700,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {content.buttonLabel}
                </a>
              ) : null}
            </div>
          )}
        </div>
        {content.showProgressNavigation && content.beats.length > 1 && effectiveInteractive ? (
          <nav
            aria-label="Scroll Experience chapters"
            style={{
              position: 'absolute',
              right: 'max(1rem, env(safe-area-inset-right))',
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'grid',
              gap: 10,
            }}
          >
            {content.beats.map((beat) => (
              <button
                key={beat.id}
                type="button"
                aria-label={beat.title || 'Jump to chapter'}
                onClick={() => {
                  const root = rootRef.current
                  if (!root) return
                  const top =
                    scrollY +
                    root.getBoundingClientRect().top +
                    beat.startProgress * Math.max(1, root.offsetHeight - innerHeight)
                  window.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' })
                }}
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,.72)',
                  background: 'rgba(12,12,15,.4)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </nav>
        ) : null}
        {effectiveInteractive ? (
          <div
            ref={scrollHintRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 'max(1.25rem, env(safe-area-inset-bottom))',
              zIndex: 4,
              transform: 'translate3d(-50%,0,0)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              color: 'rgba(255,255,255,.78)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.14em',
              textTransform: 'uppercase',
              textShadow: '0 1px 12px rgba(0,0,0,.55)',
              willChange: 'opacity, transform',
              pointerEvents: 'none',
            }}
          >
            <span>Scroll to explore</span>
            <span style={{ fontSize: 16, lineHeight: 1 }}>↓</span>
          </div>
        ) : null}
      </div>
    </section>
  )
}
