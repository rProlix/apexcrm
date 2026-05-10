// components/site/sections/AboutSection.tsx
import Image from 'next/image'
import type { AboutContent } from '@/lib/website/types'

interface Props { content: AboutContent }

export function AboutSection({ content }: Props) {
  const c   = (content && typeof content === 'object' ? content : {}) as Partial<AboutContent>
  const raw = c as Record<string, unknown>

  const headline  = typeof c.headline === 'string'  ? c.headline  : ''
  const body      = typeof c.body === 'string'      ? c.body      : ''
  const teamItems = Array.isArray(c.teamItems)      ? c.teamItems : []

  // Support both camelCase (current) and snake_case (legacy data) field names.
  const image =
    (typeof c.image === 'string'           ? c.image                 : null) ??
    (typeof raw.image_url === 'string'     ? raw.image_url as string : null) ??
    (typeof raw.imageUrl === 'string'      ? raw.imageUrl as string  : null) ??
    null

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
            <Image
              src={image}
              alt={headline || 'About us'}
              width={800}
              height={400}
              unoptimized
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
            {teamItems.map((member, i) => {
              const name = typeof member?.name === 'string' ? member.name : ''
              const role = typeof member?.role === 'string' ? member.role : ''
              const avatar = typeof member?.avatar === 'string' ? member.avatar : null
              return (
              <div key={i} style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            '0.75rem',
                textAlign:      'center',
              }}>
                {avatar
                  ? <Image src={avatar} alt={name} width={80} height={80} unoptimized
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
                      {name.charAt(0) || '?'}
                    </div>
                }
                <div>
                  <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9375rem' }}>
                    {name}
                  </p>
                  <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
                    {role}
                  </p>
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
