'use client'

// components/website/3d/ScrollHeadline.tsx
// Word/character headline animation that is HYDRATION-SAFE.
//
// Strategy:
//  - Server + first client render output the plain text (identical markup) so
//    there is never a hydration mismatch and the headline is fully readable if
//    JavaScript never runs (SEO + accessibility).
//  - After mount we re-render into word/char spans and run a staggered reveal
//    using CSS transitions (GPU friendly, no per-frame React renders).
//  - We deliberately do NOT use Splitting.js to avoid DOM mutation that React
//    doesn't know about; this is a React-safe splitter.

import { useEffect, useState } from 'react'
import type { TextAnimation } from '@/lib/website/premium3d/types'

type Tag = 'h1' | 'h2' | 'p' | 'span' | 'div'

interface Props {
  text:       string
  animation?: TextAnimation
  as?:        Tag
  className?: string
  style?:     React.CSSProperties
  /** Reduced motion / disabled — render static text */
  disabled?:  boolean
}

function hiddenStyle(animation: TextAnimation): React.CSSProperties {
  switch (animation) {
    case 'blurReveal':
      return { opacity: 0, filter: 'blur(12px)', transform: 'translateY(0.25em)' }
    case 'scaleWords':
      return { opacity: 0, transform: 'scale(0.8)' }
    case 'luxurySplit':
      return { opacity: 0, transform: 'translateY(0.6em) rotate(2deg)' }
    case 'fadeUpWords':
    default:
      return { opacity: 0, transform: 'translateY(0.5em)' }
  }
}

const VISIBLE_STYLE: React.CSSProperties = {
  opacity: 1,
  filter: 'blur(0px)',
  transform: 'none',
}

export function ScrollHeadline({
  text,
  animation = 'fadeUpWords',
  as = 'h1',
  className,
  style,
  disabled = false,
}: Props) {
  // phase: 'static' (SSR + first render) → 'enter' (spans hidden) → 'in' (revealed)
  const [phase, setPhase] = useState<'static' | 'enter' | 'in'>('static')

  useEffect(() => {
    if (disabled || animation === 'none' || !text) return
    setPhase('enter')
    const id = requestAnimationFrame(() => {
      // second frame so the browser registers the hidden state before transition
      requestAnimationFrame(() => setPhase('in'))
    })
    return () => cancelAnimationFrame(id)
  }, [disabled, animation, text])

  const Tag = as

  // Static / no-animation / reduced-motion path → plain text (matches SSR)
  if (disabled || animation === 'none' || phase === 'static' || !text) {
    return <Tag className={className} style={style}>{text}</Tag>
  }

  const words = text.split(/(\s+)/) // keep whitespace tokens
  const hidden = hiddenStyle(animation)
  let wordIndex = 0

  return (
    <Tag className={className} style={style} aria-label={text}>
      {words.map((token, i) => {
        if (/^\s+$/.test(token)) return <span key={i}> </span>
        const idx = wordIndex++
        const delay = idx * 0.06
        const isIn = phase === 'in'
        return (
          <span
            key={i}
            aria-hidden="true"
            style={{
              display: 'inline-block',
              willChange: 'opacity, transform, filter',
              transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${delay}s, filter 0.7s ease ${delay}s`,
              ...(isIn ? VISIBLE_STYLE : hidden),
            }}
          >
            {token}
          </span>
        )
      })}
    </Tag>
  )
}
