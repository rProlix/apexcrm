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
    <section style={{ padding: '5rem 1.5rem', background: 'var(--color-bg)' }}>
      {bannerImage && (
        <div style={{ width: '100%', maxHeight: 360, overflow: 'hidden', marginBottom: '0' }}>
          <Image src={bannerImage} alt={headline || 'Services'} width={1200} height={360} unoptimized
            style={{ width: '100%', height: 360, objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {(headline || subtitle) && (
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            {headline && (
              <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
                fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 700, fontFamily: 'var(--font-heading)',
                color: 'var(--color-text)', margin: '0 0 0.75rem',
              }}>
                {headline}
              </AnimatedElement>
            )}
            {subtitle && (
              <AnimatedElement as="p" animConfig={ca?.subheading ?? ca?.text} index={1} style={{
                fontSize: '1.0625rem', color: 'var(--color-muted)', margin: 0, maxWidth: 560,
                marginLeft: 'auto', marginRight: 'auto',
              }}>
                {subtitle}
              </AnimatedElement>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '1.5rem' }}>
          {items.map((item, i) => {
            const title       = typeof item?.title === 'string'       ? item.title       : ''
            const description = typeof item?.description === 'string' ? item.description : ''
            const icon        = typeof item?.icon === 'string'        ? item.icon        : ''
            const image       = typeof item?.image === 'string'       ? item.image       : null
            return (
              <AnimatedElement key={i} animConfig={ca?.card ?? ca?.feature_card} index={i} style={{
                background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                borderRadius: '1rem', padding: '2rem', display: 'flex', flexDirection: 'column', gap: '0.75rem',
              }}>
                {image && (
                  <Image src={image} alt={title} width={400} height={140} unoptimized
                    style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: '0.5rem' }} />
                )}
                {icon && !image && (
                  <div style={{
                    width: 40, height: 40, borderRadius: '0.625rem',
                    background: 'var(--color-primary)', opacity: 0.12,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.25rem',
                  }}>
                    {icon}
                  </div>
                )}
                <h3 style={{
                  fontSize: '1.0625rem', fontWeight: 700, color: 'var(--color-text)',
                  fontFamily: 'var(--font-heading)', margin: 0,
                }}>{title}</h3>
                <p style={{
                  fontSize: '0.9375rem', color: 'var(--color-muted)', margin: 0, lineHeight: 1.6,
                }}>{description}</p>
              </AnimatedElement>
            )
          })}
        </div>
      </div>
    </section>
  )
}
