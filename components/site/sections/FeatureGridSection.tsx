// components/site/sections/FeatureGridSection.tsx
import Image from 'next/image'
import type { FeatureGridContent } from '@/lib/website/types'
import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content:              FeatureGridContent
  componentAnimations?: SectionComponentAnimations
}

export function FeatureGridSection({ content, componentAnimations: ca }: Props) {
  const c   = (content && typeof content === 'object' ? content : {}) as Partial<FeatureGridContent>
  const raw = c as Record<string, unknown>

  const headline = typeof c.headline === 'string' ? c.headline : ''
  const subtitle = typeof c.subtitle === 'string' ? c.subtitle : ''
  const columns  = c.columns === 2 || c.columns === 4 ? c.columns : 3
  const items    = Array.isArray(c.items) ? c.items : []

  const bannerImage =
    (typeof raw.bannerImage === 'string'  ? raw.bannerImage as string  : null) ??
    (typeof raw.banner_image === 'string' ? raw.banner_image as string : null) ??
    null

  const gridCols = columns === 2 ? 'repeat(2, 1fr)'
    : columns === 4 ? 'repeat(auto-fit, minmax(220px, 1fr))'
    : 'repeat(auto-fit, minmax(260px, 1fr))'

  return (
    <section style={{ padding: 'var(--section-padding-desk, 5rem 1.5rem)' }}>
      {bannerImage && (
        <div style={{ width: '100%', maxHeight: 360, overflow: 'hidden', marginBottom: '0' }}>
          <Image src={bannerImage} alt={headline || 'Services'} width={1200} height={360} unoptimized
            style={{ width: '100%', height: 360, objectFit: 'cover', borderRadius: 'var(--radius-image, 0)' }} />
        </div>
      )}
      <div style={{ maxWidth: 'var(--max-width, 1200px)', margin: '0 auto' }}>
        {(headline || subtitle) && (
          <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
            {headline && (
              <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
                fontSize:      'clamp(1.5rem, 3vw, 2.5rem)',
                fontWeight:    'var(--font-weight-heading, 700)' as React.CSSProperties['fontWeight'],
                fontFamily:    'var(--font-heading)',
                letterSpacing: 'var(--letter-spacing, -0.02em)',
                color:         'var(--ds-text, var(--color-text))',
                margin:        '0 0 0.875rem',
              }}>
                {headline}
              </AnimatedElement>
            )}
            {subtitle && (
              <AnimatedElement as="p" animConfig={ca?.subheading ?? ca?.text} index={1} style={{
                fontSize:   '1.125rem',
                color:      'var(--ds-muted, var(--color-muted))',
                margin:     0,
                maxWidth:   580,
                lineHeight: 'var(--line-height, 1.65)',
                marginLeft: 'auto', marginRight: 'auto',
              }}>
                {subtitle}
              </AnimatedElement>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '1.75rem' }}>
          {items.map((item, i) => {
            const title       = typeof item?.title === 'string'       ? item.title       : ''
            const description = typeof item?.description === 'string' ? item.description : ''
            const icon        = typeof item?.icon === 'string'        ? item.icon        : ''
            const image       = typeof item?.image === 'string'       ? item.image       : null
            return (
              <AnimatedElement key={i} animConfig={ca?.card ?? ca?.feature_card} index={i} style={{
                background:   'var(--ds-surface, var(--color-surface))',
                border:       '1px solid var(--ds-border, var(--color-border))',
                borderRadius: 'var(--radius-card, 1rem)',
                padding:      '2rem',
                display:      'flex',
                flexDirection:'column',
                gap:          '0.875rem',
                boxShadow:    'var(--shadow-card)',
                transition:   'transform 0.2s ease, box-shadow 0.2s ease',
              }}>
                {image && (
                  <Image src={image} alt={title} width={400} height={160} unoptimized
                    style={{ width: '100%', height: 160, objectFit: 'cover', borderRadius: 'var(--radius-image, 0.5rem)' }} />
                )}
                {icon && !image && (
                  <div style={{
                    width:        48,
                    height:       48,
                    borderRadius: '0.75rem',
                    background:   'var(--ds-primary-light, rgba(37,99,235,0.10))',
                    display:      'flex',
                    alignItems:   'center',
                    justifyContent: 'center',
                    fontSize:     '1.5rem',
                    flexShrink:   0,
                  }}>
                    {icon}
                  </div>
                )}
                <h3 style={{
                  fontSize:      '1.0625rem',
                  fontWeight:    700,
                  color:         'var(--ds-text, var(--color-text))',
                  fontFamily:    'var(--font-heading)',
                  letterSpacing: 'var(--letter-spacing, -0.01em)',
                  margin:        0,
                }}>{title}</h3>
                <p style={{
                  fontSize:   '0.9375rem',
                  color:      'var(--ds-muted, var(--color-muted))',
                  margin:     0,
                  lineHeight: 'var(--line-height, 1.65)',
                }}>{description}</p>
              </AnimatedElement>
            )
          })}
        </div>
      </div>
    </section>
  )
}
