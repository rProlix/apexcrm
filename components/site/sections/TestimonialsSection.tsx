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
      padding:    '5rem 1.5rem',
      background: backgroundImage
        ? `url(${backgroundImage}) center/cover no-repeat`
        : 'var(--color-surface)',
      position: 'relative',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {headline && (
          <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
            textAlign: 'center', fontSize: 'clamp(1.5rem, 3vw, 2.25rem)', fontWeight: 700,
            fontFamily: 'var(--font-heading)', color: 'var(--color-text)', margin: '0 0 3rem',
          }}>
            {headline}
          </AnimatedElement>
        )}

        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap:                 '1.5rem',
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
                  background: 'var(--color-bg)', border: '1px solid var(--color-border)',
                  borderRadius: '1.25rem', padding: '1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem',
                }}
              >
                {/* Stars */}
                {rating > 0 && (
                  <div style={{ display: 'flex', gap: '0.125rem' }}>
                    {Array.from({ length: 5 }).map((_, si) => (
                      <span key={si} style={{ color: si < rating ? '#f59e0b' : 'var(--color-border)', fontSize: '0.875rem' }}>★</span>
                    ))}
                  </div>
                )}
                {text && (
                  <p style={{
                    fontSize: '0.9375rem', color: 'var(--color-text)', lineHeight: 1.6, margin: 0, fontStyle: 'italic',
                  }}>"{text}"</p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {avatar && (
                    <Image src={avatar} alt={name} width={36} height={36} unoptimized
                      style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                  )}
                  <div>
                    <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>{name}</p>
                    {role && <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-muted)' }}>{role}</p>}
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
