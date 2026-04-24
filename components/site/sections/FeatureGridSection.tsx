// components/site/sections/FeatureGridSection.tsx
import type { FeatureGridContent } from '@/lib/website/types'

interface Props { content: FeatureGridContent }

export function FeatureGridSection({ content }: Props) {
  const { headline, subtitle, columns = 3, items = [] } = content

  const gridCols = columns === 2 ? 'repeat(2, 1fr)'
    : columns === 4 ? 'repeat(auto-fit, minmax(220px, 1fr))'
    : 'repeat(auto-fit, minmax(260px, 1fr))'

  return (
    <section style={{ padding: '5rem 1.5rem', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        {(headline || subtitle) && (
          <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
            {headline && (
              <h2 style={{
                fontSize:   'clamp(1.5rem, 3vw, 2.25rem)',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                color:      'var(--color-text)',
                margin:     '0 0 0.75rem',
              }}>{headline}</h2>
            )}
            {subtitle && (
              <p style={{
                fontSize: '1.0625rem',
                color:    'var(--color-muted)',
                margin:   0,
                maxWidth: 560,
                marginLeft:  'auto',
                marginRight: 'auto',
              }}>{subtitle}</p>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: gridCols, gap: '1.5rem' }}>
          {items.map((item, i) => (
            <div key={i} style={{
              background:   'var(--color-surface)',
              border:       '1px solid var(--color-border)',
              borderRadius: '1rem',
              padding:      '2rem',
              display:      'flex',
              flexDirection: 'column',
              gap:          '0.75rem',
            }}>
              {item.image && (
                <img src={item.image} alt={item.title}
                  style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: '0.5rem' }} />
              )}
              {item.icon && !item.image && (
                <div style={{
                  width:          40,
                  height:         40,
                  borderRadius:   '0.625rem',
                  background:     'var(--color-primary)',
                  opacity:        0.12,
                  display:        'flex',
                  alignItems:     'center',
                  justifyContent: 'center',
                  fontSize:       '1.25rem',
                }}>
                  {item.icon}
                </div>
              )}
              <h3 style={{
                fontSize:   '1.0625rem',
                fontWeight: 700,
                color:      'var(--color-text)',
                fontFamily: 'var(--font-heading)',
                margin:     0,
              }}>{item.title}</h3>
              <p style={{
                fontSize:   '0.9375rem',
                color:      'var(--color-muted)',
                margin:     0,
                lineHeight: 1.6,
              }}>{item.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
