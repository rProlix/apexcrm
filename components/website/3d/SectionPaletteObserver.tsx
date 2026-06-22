'use client'

// components/website/3d/SectionPaletteObserver.tsx
// Uses IntersectionObserver to optionally swap GLOBAL website CSS variables to
// this section's palette while the section is in view, then restores them when
// it leaves. The section root always carries its own --section-* variables; this
// component only affects document-level variables when applyGlobally is true.

import { useEffect, useRef } from 'react'
import type { ScrollHeroPalette } from '@/lib/website/premium3d/types'

interface Props {
  palette:        ScrollHeroPalette
  applyGlobally?: boolean
  /** The section root element to observe */
  targetRef:      React.RefObject<HTMLElement | null>
}

// Map from our palette keys to global website CSS variables (best-effort).
const GLOBAL_VAR_MAP: Array<[keyof ScrollHeroPalette, string]> = [
  ['background', '--color-background'],
  ['foreground', '--color-text'],
  ['accent',     '--color-primary'],
  ['muted',      '--color-muted'],
]

export function SectionPaletteObserver({ palette, applyGlobally, targetRef }: Props) {
  const previousRef = useRef<Record<string, string>>({})

  useEffect(() => {
    if (!applyGlobally) return
    if (typeof window === 'undefined') return
    const el = targetRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const root = document.documentElement
    const apply = () => {
      const prev: Record<string, string> = {}
      for (const [key, cssVar] of GLOBAL_VAR_MAP) {
        prev[cssVar] = root.style.getPropertyValue(cssVar)
        root.style.setProperty(cssVar, palette[key])
      }
      previousRef.current = prev
    }
    const restore = () => {
      for (const [, cssVar] of GLOBAL_VAR_MAP) {
        const prev = previousRef.current[cssVar]
        if (prev) root.style.setProperty(cssVar, prev)
        else root.style.removeProperty(cssVar)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > 0.4) apply()
          else restore()
        }
      },
      { threshold: [0, 0.4, 0.6, 1] },
    )
    observer.observe(el)

    return () => {
      observer.disconnect()
      restore()
    }
  }, [palette, applyGlobally, targetRef])

  return null
}
