'use client'

import { useEffect, useRef, useState } from 'react'

const STANDARD_HOLD_MS = 1450
const STANDARD_EXIT_MS = 360
const REDUCED_HOLD_MS = 180
const REDUCED_EXIT_MS = 160

export function AppLaunchScreen() {
  const [phase, setPhase] = useState<'entering' | 'leaving' | 'complete'>('entering')
  const previousOverflow = useRef('')

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const holdDuration = reduceMotion ? REDUCED_HOLD_MS : STANDARD_HOLD_MS
    const exitDuration = reduceMotion ? REDUCED_EXIT_MS : STANDARD_EXIT_MS
    previousOverflow.current = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    const exitTimer = window.setTimeout(() => setPhase('leaving'), holdDuration)
    const completeTimer = window.setTimeout(
      () => setPhase('complete'),
      holdDuration + exitDuration
    )

    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(completeTimer)
      document.body.style.overflow = previousOverflow.current
    }
  }, [])

  useEffect(() => {
    if (phase !== 'complete') return
    document.body.style.overflow = previousOverflow.current
  }, [phase])

  if (phase === 'complete') return null

  return (
    <div
      className="app-launch-screen"
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-label="NexoraNow is preparing your workspace"
    >
      <div className="app-launch-ambient" aria-hidden="true" />
      <div className="app-launch-grid" aria-hidden="true" />

      <div className="app-launch-content">
        <div className="app-launch-mark" aria-hidden="true">
          <span className="app-launch-mark-letter">N</span>
          <span className="app-launch-mark-sheen" />
        </div>

        <div className="app-launch-wordmark" aria-hidden="true">
          <span>Nexora</span>
          <span className="app-launch-wordmark-accent">Now</span>
        </div>

        <div className="app-launch-progress" aria-hidden="true">
          <span />
        </div>

        <p className="app-launch-status">Preparing your workspace</p>
      </div>
    </div>
  )
}
