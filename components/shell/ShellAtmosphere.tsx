'use client'

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion'
import { useEffect } from 'react'

const POINTER_QUERY = '(hover: hover) and (pointer: fine)'

/**
 * A decorative light that follows fine-pointer movement without causing
 * React renders. It lives behind the product UI and is disabled for reduced
 * motion, touch input, and background tabs.
 */
export function ShellAtmosphere() {
  const reduceMotion = useReducedMotion()
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const targetOpacity = useMotionValue(0)
  const smoothX = useSpring(pointerX, { stiffness: 115, damping: 28, mass: 0.75 })
  const smoothY = useSpring(pointerY, { stiffness: 115, damping: 28, mass: 0.75 })
  const smoothOpacity = useSpring(targetOpacity, { stiffness: 150, damping: 24, mass: 0.6 })
  const transform = useMotionTemplate`translate3d(calc(${smoothX}px - 50%), calc(${smoothY}px - 50%), 0)`

  useEffect(() => {
    if (reduceMotion || !window.matchMedia(POINTER_QUERY).matches) return

    let animationFrame: number | null = null
    let nextX = window.innerWidth * 0.7
    let nextY = window.innerHeight * 0.28

    pointerX.set(nextX)
    pointerY.set(nextY)

    const commitPointer = () => {
      pointerX.set(nextX)
      pointerY.set(nextY)
      targetOpacity.set(1)
      animationFrame = null
    }

    const handlePointerMove = (event: PointerEvent) => {
      nextX = event.clientX
      nextY = event.clientY
      if (animationFrame === null) {
        animationFrame = window.requestAnimationFrame(commitPointer)
      }
    }

    const hideLight = () => targetOpacity.set(0)
    const handleVisibility = () => {
      if (document.hidden) hideLight()
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('blur', hideLight)
    document.addEventListener('mouseleave', hideLight)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      if (animationFrame !== null) window.cancelAnimationFrame(animationFrame)
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('blur', hideLight)
      document.removeEventListener('mouseleave', hideLight)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [pointerX, pointerY, reduceMotion, targetOpacity])

  if (reduceMotion) return null

  return (
    <motion.span
      className="crm-pointer-light"
      style={{ opacity: smoothOpacity, transform }}
      aria-hidden="true"
    />
  )
}
