// components/site/sections/AboutSection.tsx
import type { AboutContent } from '@/lib/website/types'

interface Props { content: AboutContent }

export function AboutSection({ content }: Props) {
  const { headline, body, image, teamItems = [] } = content

  return (
    <section style={{ padding: '5rem 1.5rem', background: 'var(--color-surface)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '4rem' }}>

        {/* Main about block */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: image ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr',
          gap:                 '3rem',
          alignItems:          'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {headline && (
              <h2 style={{
                fontSize:   'clamp(1.5rem, 3vw, 2.25rem)',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                color:      'var(--color-text)',
                margin:     0,
              }}>{headline}</h2>
            )}
            {body && (
              <p style={{ color: 'var(--color-muted)', lineHeight: 1.75, margin: 0, fontSize: '1rem' }}>
                {body}
              </p>
            )}
          </div>
          {image && (
            <img
              src={image}
              alt={headline || 'About us'}
              style={{ width: '100%', borderRadius: '1rem', objectFit: 'cover', maxHeight: 400 }}
            />
          )}
        </div>

        {/* Team grid */}
        {teamItems.length > 0 && (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap:                 '1.5rem',
          }}>
            {teamItems.map((member, i) => (
              <div key={i} style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            '0.75rem',
                textAlign:      'center',
              }}>
                {member.avatar
                  ? <img src={member.avatar} alt={member.name}
                      style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
                  : <div style={{
                      width:          80,
                      height:         80,
                      borderRadius:   '50%',
                      background:     'var(--color-border)',
                      display:        'flex',
                      alignItems:     'center',
                      justifyContent: 'center',
                      fontSize:       '1.75rem',
                    }}>
                      {member.name.charAt(0)}
                    </div>
                }
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9375rem' }}>
                    {member.name}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                    {member.role}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
