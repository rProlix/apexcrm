// components/site/sections/CtaSection.tsx
import Link from 'next/link'
import type { CtaContent } from '@/lib/website/types'
import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content:              CtaContent
  componentAnimations?: SectionComponentAnimations
}

export function CtaSection({ content, componentAnimations: ca }: Props) {
  const c   = (content && typeof content === 'object' ? content : {}) as Partial<CtaContent>
  const raw = c as Record<string, unknown>

  const headline = typeof c.headline === 'string' ? c.headline : ''
  const body     = typeof c.body === 'string'     ? c.body     : ''
  const ctaLabel = typeof c.ctaLabel === 'string' ? c.ctaLabel : ''
  const ctaHref  = typeof c.ctaHref === 'string'  ? c.ctaHref  : '/shop'
  const align    = c.align === 'left' || c.align === 'right' ? c.align : 'center'

  // backgroundImage is set by the AI image builder.
  const backgroundImage =
    (typeof raw.backgroundImage === 'string'   ? raw.backgroundImage as string   : null) ??
    (typeof raw.background_image === 'string'  ? raw.background_image as string  : null) ??
    null

  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'

  return (
    <section style={{
      padding:    'var(--section-padding-desk, 6rem 1.5rem)',
      background: backgroundImage
        ? `url(${backgroundImage}) center/cover no-repeat`
        : 'var(--ds-primary, var(--color-primary))',
      position: 'relative',
    }}>
      {/* Gradient overlay for image backgrounds */}
      {backgroundImage && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 0,
          background: 'var(--gradient-overlay-dark)',
        }} />
      )}
      <div style={{
        position:       'relative',
        zIndex:         1,
        maxWidth:       860,
        margin:         '0 auto',
        display:        'flex',
        flexDirection:  'column',
        alignItems,
        textAlign,
        gap:            '1.75rem',
      }}>
        <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
          fontSize:      'clamp(1.75rem, 4vw, 3rem)',
          fontWeight:    'var(--font-weight-heading, 800)' as React.CSSProperties['fontWeight'],
          color:         '#fff',
          fontFamily:    'var(--font-heading)',
          letterSpacing: 'var(--letter-spacing, -0.02em)',
          margin:        0,
          textShadow:    '0 2px 8px rgba(0,0,0,0.20)',
        }}>{headline}</AnimatedElement>
        {body && (
          <AnimatedElement as="p" animConfig={ca?.paragraph ?? ca?.text} index={1} style={{
            fontSize:   '1.125rem',
            color:      'rgba(255,255,255,0.88)',
            margin:     0,
            lineHeight: 'var(--line-height, 1.65)',
            maxWidth:   580,
          }}>{body}</AnimatedElement>
        )}
        {ctaLabel && (
          <AnimatedElement animConfig={ca?.button ?? ca?.cta} index={2}>
          <Link href={ctaHref || '/shop'} style={{
            background:     '#fff',
            color:          'var(--ds-primary, var(--color-primary))',
            padding:        '0.9375rem 2.5rem',
            borderRadius:   'var(--radius-button, 0.75rem)',
            fontWeight:     700,
            fontSize:       '1rem',
            textDecoration: 'none',
            display:        'inline-block',
            boxShadow:      '0 4px 20px rgba(0,0,0,0.22)',
          }}>
            {ctaLabel}
          </Link>
          </AnimatedElement>
        )}
      </div>
    </section>
  )
}
