// components/site/sections/TestimonialsSection.tsx
import Image from 'next/image'
import type { TestimonialsContent } from '@/lib/website/types'
import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content:              TestimonialsContent
  componentAnimations?: SectionComponentAnimations
}

export function TestimonialsSection({ content, componentAnimations: ca }: Props) {
  const c   = (content && typeof content === 'object' ? content : {}) as Partial<TestimonialsContent>
  const raw = c as Record<string, unknown>

  const headline = typeof c.headline === 'string' ? c.headline : ''
  const items    = Array.isArray(c.items) ? c.items : []

  const backgroundImage =
    (typeof raw.backgroundImage === 'string'  ? raw.backgroundImage as string  : null) ??
    (typeof raw.background_image === 'string' ? raw.background_image as string : null) ??
    null

  if (items.length === 0) return null

  return (
    <section style={{
      padding:    'var(--section-padding-desk, 5rem 1.5rem)',
      background: backgroundImage
        ? `url(${backgroundImage}) center/cover no-repeat`
        : undefined,
      position: 'relative',
    }}>
      <div style={{ maxWidth: 'var(--max-width, 1200px)', margin: '0 auto' }}>
        {headline && (
          <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
            textAlign:     'center',
            fontSize:      'clamp(1.5rem, 3vw, 2.5rem)',
            fontWeight:    'var(--font-weight-heading, 700)' as React.CSSProperties['fontWeight'],
            fontFamily:    'var(--font-heading)',
            letterSpacing: 'var(--letter-spacing, -0.02em)',
            color:         'var(--ds-text, var(--color-text))',
            margin:        '0 0 3.5rem',
          }}>
            {headline}
          </AnimatedElement>
        )}

        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap:                 '1.75rem',
        }}>
          {items.map((item, i) => {
            const name   = typeof item?.name === 'string'   ? item.name   : ''
            const role   = typeof item?.role === 'string'   ? item.role   : ''
            const avatar = typeof item?.avatar === 'string' ? item.avatar : null
            const text   = typeof item?.text === 'string'   ? item.text   : ''
            const rating = typeof item?.rating === 'number' ? item.rating : 0
            return (
              <AnimatedElement key={i}
                animConfig={ca?.card ?? ca?.testimonial_card ?? ca?.testimonial}
                index={i}
                style={{
                  background:   'var(--ds-bg, var(--color-bg))',
                  border:       '1px solid var(--ds-border, var(--color-border))',
                  borderRadius: 'var(--radius-card, 1.25rem)',
                  padding:      '2rem',
                  display:      'flex',
                  flexDirection:'column',
                  gap:          '1.125rem',
                  boxShadow:    'var(--shadow-card)',
                }}
              >
                {/* Stars */}
                {rating > 0 && (
                  <div style={{ display: 'flex', gap: '0.125rem' }}>
                    {Array.from({ length: 5 }).map((_, si) => (
                      <span key={si} style={{ color: si < rating ? '#f59e0b' : 'var(--ds-border, var(--color-border))', fontSize: '0.9375rem' }}>★</span>
                    ))}
                  </div>
                )}
                {text && (
                  <p style={{
                    fontSize:   '0.9375rem',
                    color:      'var(--ds-text, var(--color-text))',
                    lineHeight: 'var(--line-height, 1.65)',
                    margin:     0,
                    fontStyle:  'italic',
                  }}>"{text}"</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: 'auto' }}>
                  {avatar && (
                    <Image src={avatar} alt={name} width={40} height={40} unoptimized
                      style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                  )}
                  {!avatar && (
                    <div style={{
                      width:      40, height: 40, borderRadius: '50%',
                      background: 'var(--ds-primary-light, rgba(37,99,235,0.10))',
                      display:    'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize:   '1rem', fontWeight: 700, color: 'var(--ds-primary, var(--color-primary))',
                      flexShrink: 0,
                    }}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ds-text, var(--color-text))' }}>{name}</p>
                    {role && <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ds-muted, var(--color-muted))' }}>{role}</p>}
                  </div>
                </div>
              </AnimatedElement>
            )
          })}
        </div>
      </div>
    </section>
  )
}
