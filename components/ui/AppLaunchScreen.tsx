'use client'

import { useEffect, useState } from 'react'
import { useBodyScrollLock } from '@/lib/design-system/body-scroll-lock'
import { getBrandInitials } from '@/lib/design-system/workspaceBranding'

const STANDARD_HOLD_MS = 1450
const STANDARD_EXIT_MS = 360
const REDUCED_HOLD_MS = 180
const REDUCED_EXIT_MS = 160

export function AppLaunchScreen({
  tenantName,
  logoUrl,
}: {
  tenantName: string
  logoUrl?: string | null
}) {
  const [phase, setPhase] = useState<'entering' | 'leaving' | 'complete'>('entering')
  const [logoFailed, setLogoFailed] = useState(false)
  useBodyScrollLock(phase !== 'complete')
  const visibleName = tenantName.trim() || 'Your workspace'
  const showLogo = Boolean(logoUrl) && !logoFailed

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const holdDuration = reduceMotion ? REDUCED_HOLD_MS : STANDARD_HOLD_MS
    const exitDuration = reduceMotion ? REDUCED_EXIT_MS : STANDARD_EXIT_MS

    const exitTimer = window.setTimeout(() => setPhase('leaving'), holdDuration)
    const completeTimer = window.setTimeout(() => setPhase('complete'), holdDuration + exitDuration)

    return () => {
      window.clearTimeout(exitTimer)
      window.clearTimeout(completeTimer)
    }
  }, [])

  if (phase === 'complete') return null

  return (
    <div
      className="app-launch-screen"
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-label={`${visibleName} is preparing your workspace`}
    >
      <div className="app-launch-ambient" aria-hidden="true" />
      <div className="app-launch-grid" aria-hidden="true" />

      <div className="app-launch-content">
        <div className="app-launch-mark" data-has-logo={showLogo ? 'true' : 'false'} aria-hidden="true">
          {showLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl!}
              alt=""
              className="app-launch-logo"
              onError={() => setLogoFailed(true)}
            />
          ) : (
            <span className="app-launch-mark-letter">{getBrandInitials(visibleName)}</span>
          )}
          <span className="app-launch-mark-sheen" />
        </div>

        <div className="app-launch-wordmark" aria-hidden="true">
          <span>{visibleName}</span>
        </div>

        <div className="app-launch-progress" aria-hidden="true">
          <span />
        </div>

        <p className="app-launch-status">Preparing your workspace</p>
      </div>
    </div>
  )
}
