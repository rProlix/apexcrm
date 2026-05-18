// components/site/sections/HeroSection.tsx
import Link from 'next/link'
import type { HeroContent } from '@/lib/website/types'
import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content:             HeroContent
  componentAnimations?: SectionComponentAnimations
}

export function HeroSection({ content, componentAnimations: ca }: Props) {
  const c   = (content && typeof content === 'object' ? content : {}) as Partial<HeroContent>
  const raw = c as Record<string, unknown>

  const headline          = typeof c.headline === 'string'             ? c.headline          : ''
  const subheadline       = typeof c.subheadline === 'string'          ? c.subheadline        : ''
  const ctaLabel          = typeof c.ctaLabel === 'string'             ? c.ctaLabel           : ''
  const ctaHref           = typeof c.ctaHref === 'string'              ? c.ctaHref            : '/shop'
  const ctaSecondaryLabel = typeof c.ctaSecondaryLabel === 'string'    ? c.ctaSecondaryLabel  : ''
  const ctaSecondaryHref  = typeof c.ctaSecondaryHref === 'string'     ? c.ctaSecondaryHref   : '/'
  const overlay           = c.overlay !== false
  const overlayOpacity    = typeof c.overlayOpacity === 'number'       ? c.overlayOpacity     : 40
  const align             = c.align === 'left' || c.align === 'right'  ? c.align              : 'center'

  const backgroundImage =
    (typeof c.backgroundImage === 'string'    ? c.backgroundImage              : null) ??
    (typeof raw.background_image === 'string' ? raw.background_image as string : null) ??
    (typeof raw.imageUrl === 'string'         ? raw.imageUrl as string         : null) ??
    (typeof raw.image_url === 'string'        ? raw.image_url as string        : null) ??
    null

  const textAlign  = align === 'center' ? 'center' : align === 'right' ? 'right' : 'left'
  const alignItems = align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start'

  // Determine text color: use CSS var if no background image, otherwise white
  const headlineColor   = backgroundImage ? '#fff' : 'var(--ds-text, var(--color-text))'
  const subheadColor    = backgroundImage ? 'rgba(255,255,255,0.85)' : 'var(--ds-muted, var(--color-muted))'
  const primaryBtnColor = 'var(--ds-primary, var(--color-primary))'
  const primaryBtnText  = 'var(--ds-primary-text, #fff)'

  return (
    <section style={{
      position:       'relative',
      minHeight:      '80vh',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      background:     backgroundImage
        ? `url(${backgroundImage}) center/cover no-repeat`
        : undefined,
      padding: 'var(--section-padding-desk, 6rem 1.5rem)',
    }}>
      {/* Overlay for background image */}
      {backgroundImage && overlay && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `rgba(0,0,0,${overlayOpacity / 100})`,
          zIndex: 0,
        }} />
      )}

      {/* Content */}
      <div style={{
        position:      'relative',
        zIndex:        1,
        maxWidth:      720,
        width:         '100%',
        display:       'flex',
        flexDirection: 'column',
        alignItems,
        textAlign,
        gap:           '1.5rem',
      }}>
        <AnimatedElement as="h1" animConfig={ca?.heading ?? ca?.headline ?? ca?.text} style={{
          fontSize:    'clamp(2rem, 5vw, 3.75rem)',
          fontWeight:  'var(--font-weight-heading, 800)' as React.CSSProperties['fontWeight'],
          lineHeight:  1.1,
          fontFamily:  'var(--font-heading)',
          letterSpacing: 'var(--letter-spacing, -0.02em)',
          color:       headlineColor,
          margin:      0,
        }}>
          {headline}
        </AnimatedElement>

        {subheadline && (
          <AnimatedElement as="p" animConfig={ca?.subheading ?? ca?.paragraph ?? ca?.text} index={1} style={{
            fontSize:   'clamp(1rem, 2vw, 1.3125rem)',
            color:      subheadColor,
            margin:     0,
            lineHeight: 'var(--line-height, 1.65)',
            maxWidth:   580,
          }}>
            {subheadline}
          </AnimatedElement>
        )}

        {/* CTAs */}
        <div style={{ display: 'flex', gap: '0.875rem', flexWrap: 'wrap', justifyContent: alignItems, marginTop: '0.5rem' }}>
          {ctaLabel && (
            <AnimatedElement animConfig={ca?.button ?? ca?.cta} index={2}>
              <Link href={ctaHref || '/shop'} style={{
                background:     primaryBtnColor,
                color:          primaryBtnText,
                padding:        '0.9375rem 2.25rem',
                borderRadius:   'var(--radius-button, 0.75rem)',
                fontWeight:     700,
                fontSize:       '1rem',
                textDecoration: 'none',
                display:        'inline-block',
                boxShadow:      'var(--shadow-button, 0 4px 16px rgba(0,0,0,0.18))',
                transition:     'opacity 0.15s, transform 0.15s',
              }}>
                {ctaLabel}
              </Link>
            </AnimatedElement>
          )}
          {ctaSecondaryLabel && (
            <AnimatedElement animConfig={ca?.button} index={3}>
              <Link href={ctaSecondaryHref || '/'} style={{
                background:     'rgba(255,255,255,0.12)',
                color:          backgroundImage ? '#fff' : 'var(--ds-text, var(--color-text))',
                border:         '1px solid rgba(255,255,255,0.28)',
                padding:        '0.9375rem 2.25rem',
                borderRadius:   'var(--radius-button, 0.75rem)',
                fontWeight:     600,
                fontSize:       '1rem',
                textDecoration: 'none',
                display:        'inline-block',
                backdropFilter: 'blur(8px)',
              }}>
                {ctaSecondaryLabel}
              </Link>
            </AnimatedElement>
          )}
        </div>
      </div>
    </section>
  )
}
