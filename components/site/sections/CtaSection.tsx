// components/site/sections/CtaSection.tsx
import Link from 'next/link'
import type { CtaContent } from '@/lib/website/types'

interface Props { content: CtaContent }

export function CtaSection({ content }: Props) {
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
      padding:    '5rem 1.5rem',
      background: backgroundImage
        ? `url(${backgroundImage}) center/cover no-repeat`
        : 'var(--color-primary)',
      position: 'relative',
    }}>
      <div style={{
        maxWidth:       800,
        margin:         '0 auto',
        display:        'flex',
        flexDirection:  'column',
        alignItems,
        textAlign,
        gap:            '1.5rem',
      }}>
        <h2 style={{
          fontSize:   'clamp(1.75rem, 4vw, 2.75rem)',
          fontWeight: 800,
          color:      '#fff',
          fontFamily: 'var(--font-heading)',
          margin:     0,
        }}>{headline}</h2>
        {body && (
          <p style={{
            fontSize:   '1.0625rem',
            color:      'rgba(255,255,255,0.8)',
            margin:     0,
            lineHeight: 1.6,
            maxWidth:   560,
          }}>{body}</p>
        )}
        {ctaLabel && (
          <Link href={ctaHref || '/shop'} style={{
            background:     '#fff',
            color:          'var(--color-primary)',
            padding:        '0.875rem 2.25rem',
            borderRadius:   '0.875rem',
            fontWeight:     700,
            fontSize:       '1rem',
            textDecoration: 'none',
            display:        'inline-block',
          }}>
            {ctaLabel}
          </Link>
        )}
      </div>
    </section>
  )
}
