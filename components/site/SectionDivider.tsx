// components/site/SectionDivider.tsx
// Lightweight SVG dividers for seamless section-to-section transitions.
// No external dependencies — pure CSS + inline SVG.

import type { DividerStyle } from '@/lib/website/design/types'

interface Props {
  style:     DividerStyle
  position:  'top' | 'bottom'
  /** Fill color of the CURRENT section (the color the SVG blends into) */
  fillColor: string
  className?: string
  height?:    number
}

export function SectionDivider({
  style,
  position,
  fillColor,
  height = 80,
}: Props) {
  if (style === 'none' || !style) return null

  const h = Math.max(40, Math.min(160, height))

  // Top dividers point upward (the cut comes from the top)
  // Bottom dividers point downward
  const flip = position === 'top' ? 'scaleY(-1)' : undefined

  const svgStyle: React.CSSProperties = {
    display:        'block',
    width:          '100%',
    height:         `${h}px`,
    transform:      flip,
    position:       'absolute',
    left:           0,
    right:          0,
    zIndex:         2,
    pointerEvents:  'none',
    ...(position === 'top'
      ? { top: `-${h - 1}px` }
      : { bottom: `-${h - 1}px` }),
  }

  const fill = fillColor || 'currentColor'

  switch (style) {
    case 'wave':
      return (
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none" aria-hidden="true" style={svgStyle}>
          <path
            d="M0,40 C240,80 480,0 720,40 C960,80 1200,0 1440,40 L1440,80 L0,80 Z"
            fill={fill}
          />
        </svg>
      )

    case 'curve':
      return (
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none" aria-hidden="true" style={svgStyle}>
          <path
            d="M0,80 Q720,-10 1440,80 L1440,80 L0,80 Z"
            fill={fill}
          />
        </svg>
      )

    case 'angle':
      return (
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none" aria-hidden="true" style={svgStyle}>
          <path
            d="M0,80 L1440,0 L1440,80 Z"
            fill={fill}
          />
        </svg>
      )

    case 'fade':
      return (
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none" aria-hidden="true" style={svgStyle}>
          <defs>
            <linearGradient id={`fade-grad-${position}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity="0" />
              <stop offset="100%" stopColor={fill} stopOpacity="1" />
            </linearGradient>
          </defs>
          <rect
            x="0" y="0" width="1440" height="80"
            fill={`url(#fade-grad-${position})`}
          />
        </svg>
      )

    case 'overlap':
      return (
        <svg viewBox="0 0 1440 80" xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none" aria-hidden="true" style={{ ...svgStyle, height: `${h * 1.5}px` }}>
          <path
            d="M0,40 C360,80 1080,0 1440,40 L1440,120 L0,120 Z"
            fill={fill}
          />
        </svg>
      )

    default:
      return null
  }
}
