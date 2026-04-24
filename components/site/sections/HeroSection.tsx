// components/site/sections/HeroSection.tsx
import Link from 'next/link'
import type { HeroContent } from '@/lib/website/types'

interface Props {
  content: HeroContent
}

export function HeroSection({ content }: Props) {
  const {
    headline, subheadline, ctaLabel, ctaHref,
    ctaSecondaryLabel, ctaSecondaryHref,
    backgroundImage, overlay, overlayOpacity = 40, align = 'center',
  } = content

  const textAlign = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'

  return (
    <section style={{
      position:       'relative',
      minHeight:      '80vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      background:     backgroundImage
        ? `url(${backgroundImage}) center/cover no-repeat`
        : 'var(--color-surface)',
      padding: '5rem 1.5rem',
    }}>
      {/* Overlay */}
      {backgroundImage && overlay && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `rgba(0,0,0,${overlayOpacity / 100})`,
        }} />
      )}

      {/* Content */}
      <div style={{
        position:       'relative',
        zIndex:         1,
        maxWidth:       720,
        width:          '100%',
        display:        'flex',
        flexDirection:  'column',
        alignItems,
        textAlign,
        gap:            '1.5rem',
      }}>
        <h1 style={{
          fontSize:   'clamp(2rem, 5vw, 3.5rem)',
          fontWeight: 800,
          lineHeight: 1.1,
          fontFamily: 'var(--font-heading)',
          color:      backgroundImage ? '#fff' : 'var(--color-text)',
          margin:     0,
        }}>
          {headline}
        </h1>

        {subheadline && (
          <p style={{
            fontSize:   'clamp(1rem, 2vw, 1.25rem)',
            color:      backgroundImage ? 'rgba(255,255,255,0.8)' : 'var(--color-muted)',
            margin:     0,
            lineHeight: 1.6,
            maxWidth:   560,
          }}>
            {subheadline}
          </p>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: alignItems }}>
          {ctaLabel && (
            <Link href={ctaHref || '/shop'} style={{
              background:     'var(--color-primary)',
              color:          '#fff',
              padding:        '0.875rem 2rem',
              borderRadius:   '0.875rem',
              fontWeight:     700,
              fontSize:       '1rem',
              textDecoration: 'none',
              display:        'inline-block',
              transition:     'opacity 0.15s',
            }}>
              {ctaLabel}
            </Link>
          )}
          {ctaSecondaryLabel && (
            <Link href={ctaSecondaryHref || '/'} style={{
              background:     'rgba(255,255,255,0.12)',
              color:          backgroundImage ? '#fff' : 'var(--color-text)',
              border:         '1px solid rgba(255,255,255,0.2)',
              padding:        '0.875rem 2rem',
              borderRadius:   '0.875rem',
              fontWeight:     600,
              fontSize:       '1rem',
              textDecoration: 'none',
              display:        'inline-block',
            }}>
              {ctaSecondaryLabel}
            </Link>
          )}
        </div>
      </div>
    </section>
  )
}
