// components/site/sections/TestimonialsSection.tsx
import Image from 'next/image'
import type { TestimonialsContent } from '@/lib/website/types'

interface Props { content: TestimonialsContent }

export function TestimonialsSection({ content }: Props) {
  const { headline, items = [] } = content

  // backgroundImage is set by the AI image builder.
  const raw = content as unknown as Record<string, unknown>
  const backgroundImage = (raw.backgroundImage ?? raw.background_image) as string | undefined

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
          <h2 style={{
            textAlign:  'center',
            fontSize:   'clamp(1.5rem, 3vw, 2.25rem)',
            fontWeight: 700,
            fontFamily: 'var(--font-heading)',
            color:      'var(--color-text)',
            margin:     '0 0 3rem',
          }}>{headline}</h2>
        )}
        <div style={{
          display:             'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap:                 '1.5rem',
        }}>
          {items.map((item, i) => (
            <div key={i} style={{
              background:   'var(--color-bg)',
              border:       '1px solid var(--color-border)',
              borderRadius: '1.25rem',
              padding:      '1.75rem',
              display:      'flex',
              flexDirection: 'column',
              gap:          '1rem',
            }}>
              {/* Stars */}
              {item.rating > 0 && (
                <div style={{ display: 'flex', gap: '0.125rem' }}>
                  {Array.from({ length: 5 }).map((_, si) => (
                    <span key={si} style={{
                      color: si < item.rating ? '#f59e0b' : 'var(--color-border)',
                      fontSize: '0.875rem',
                    }}>★</span>
                  ))}
                </div>
              )}
              <p style={{
                fontSize:   '0.9375rem',
                color:      'var(--color-text)',
                lineHeight: 1.6,
                margin:     0,
                fontStyle:  'italic',
              }}>"{item.text}"</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {item.avatar && (
                  <Image src={item.avatar} alt={item.name} width={36} height={36} unoptimized
                    style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover' }} />
                )}
                <div>
                  <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text)' }}>
                    {item.name}
                  </p>
                  {item.role && (
                    <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-muted)' }}>{item.role}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
