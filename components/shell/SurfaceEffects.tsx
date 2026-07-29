'use client'

import { useReducedMotion } from 'framer-motion'
import { useEffect } from 'react'

const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)'
const SURFACE_SELECTOR = [
  '.ui-card',
  '.ui-surface',
  '.premium-panel',
  '[data-ui-spotlight]',
].join(',')

/**
 * Adds one pointer-local reflection system to shared CRM surfaces.
 * Event delegation keeps the effect available across modules without adding
 * listeners or React state to every card.
 */
export function SurfaceEffects() {
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion || !window.matchMedia(FINE_POINTER_QUERY).matches) return

    let activeSurface: HTMLElement | null = null
    let pendingSurface: HTMLElement | null = null
    let pointerX = 0
    let pointerY = 0
    let animationFrame: number | null = null

    const clearSurface = () => {
      if (!activeSurface) return
      activeSurface.removeAttribute('data-ui-spotlight-active')
      activeSurface.style.removeProperty('--ui-spotlight-x')
      activeSurface.style.removeProperty('--ui-spotlight-y')
      activeSurface = null
    }

    const commitPointer = () => {
      animationFrame = null
      if (!pendingSurface) {
        clearSurface()
        return
      }

      if (activeSurface !== pendingSurface) {
        clearSurface()
        activeSurface = pendingSurface
        activeSurface.setAttribute('data-ui-spotlight-active', 'true')
        const rect = activeSurface.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) return
        const x = Math.max(0, Math.min(100, ((pointerX - rect.left) / rect.width) * 100))
        const y = Math.max(0, Math.min(100, ((pointerY - rect.top) / rect.height) * 100))
        activeSurface.style.setProperty('--ui-spotlight-x', `${x}%`)
        activeSurface.style.setProperty('--ui-spotlight-y', `${y}%`)
      }
    }

    const handlePointerOver = (event: PointerEvent) => {
      const origin = event.target instanceof Element ? event.target : null
      const candidate = origin?.closest<HTMLElement>(SURFACE_SELECTOR) ?? null
      const nextSurface =
        candidate?.getAttribute('data-ui-spotlight') === 'off' ? null : candidate
      if (nextSurface === activeSurface || nextSurface === pendingSurface) return
      pendingSurface = nextSurface
      pointerX = event.clientX
      pointerY = event.clientY
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(commitPointer)
      }
    }

    const handleWindowExit = () => {
      pendingSurface = null
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      animationFrame = null
      clearSurface()
    }
    const handleVisibility = () => {
      if (document.hidden) handleWindowExit()
    }

    document.addEventListener('pointerover', handlePointerOver, { passive: true })
    document.addEventListener('mouseleave', handleWindowExit)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('blur', handleWindowExit)

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      clearSurface()
      document.removeEventListener('pointerover', handlePointerOver)
      document.removeEventListener('mouseleave', handleWindowExit)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('blur', handleWindowExit)
    }
  }, [reduceMotion])

  return null
}
