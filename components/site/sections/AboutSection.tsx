// components/site/sections/AboutSection.tsx
import Image from 'next/image'
import type { AboutContent } from '@/lib/website/types'
import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content:              AboutContent
  componentAnimations?: SectionComponentAnimations
}

export function AboutSection({ content, componentAnimations: ca }: Props) {
  const c   = (content && typeof content === 'object' ? content : {}) as Partial<AboutContent>
  const raw = c as Record<string, unknown>

  const headline  = typeof c.headline === 'string'  ? c.headline  : ''
  const body      = typeof c.body === 'string'      ? c.body      : ''
  const teamItems = Array.isArray(c.teamItems)      ? c.teamItems : []

  const image =
    (typeof c.image === 'string'           ? c.image                 : null) ??
    (typeof raw.image_url === 'string'     ? raw.image_url as string : null) ??
    (typeof raw.imageUrl === 'string'      ? raw.imageUrl as string  : null) ??
    null

  return (
    <section style={{ padding: 'var(--section-padding-desk, 5rem 1.5rem)' }}>
      <div style={{ maxWidth: 'var(--max-width, 1200px)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '4rem' }}>

        {/* Main about block */}
        <div style={{
          display:             'grid',
          gridTemplateColumns: image ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr',
          gap:                 '3.5rem',
          alignItems:          'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {headline && (
              <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
                fontSize:      'clamp(1.5rem, 3vw, 2.5rem)',
                fontWeight:    'var(--font-weight-heading, 700)' as React.CSSProperties['fontWeight'],
                fontFamily:    'var(--font-heading)',
                letterSpacing: 'var(--letter-spacing, -0.02em)',
                color:         'var(--ds-text, var(--color-text))',
                margin:        0,
              }}>
                {headline}
              </AnimatedElement>
            )}
            {body && (
              <AnimatedElement as="p" animConfig={ca?.paragraph ?? ca?.text} index={1} style={{
                color:      'var(--ds-muted, var(--color-muted))',
                lineHeight: 'var(--line-height, 1.75)',
                margin:     0,
                fontSize:   '1.0625rem',
              }}>
                {body}
              </AnimatedElement>
            )}
          </div>

          {image && (
            <AnimatedElement animConfig={ca?.image} index={2}>
              <Image
                src={image}
                alt={headline || 'About us'}
                width={800}
                height={420}
                unoptimized
                style={{
                  width:        '100%',
                  borderRadius: 'var(--radius-image, 1rem)',
                  objectFit:    'cover',
                  maxHeight:    420,
                  boxShadow:    'var(--shadow-image)',
                }}
              />
            </AnimatedElement>
          )}
        </div>

        {/* Team grid */}
        {teamItems.length > 0 && (
          <div style={{
            display:             'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
            gap:                 '1.75rem',
          }}>
            {teamItems.map((member, i) => {
              const name   = typeof member?.name === 'string'   ? member.name   : ''
              const role   = typeof member?.role === 'string'   ? member.role   : ''
              const avatar = typeof member?.avatar === 'string' ? member.avatar : null
              return (
                <AnimatedElement key={i} animConfig={ca?.card} index={i} style={{
                  display:        'flex',
                  flexDirection:  'column',
                  alignItems:     'center',
                  gap:            '0.875rem',
                  textAlign:      'center',
                  padding:        '1.5rem',
                  background:     'var(--ds-surface, var(--color-surface))',
                  borderRadius:   'var(--radius-card, 1rem)',
                  border:         '1px solid var(--ds-border, var(--color-border))',
                  boxShadow:      'var(--shadow-card)',
                }}>
                  {avatar
                    ? <Image src={avatar} alt={name} width={80} height={80} unoptimized
                        style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', boxShadow: 'var(--shadow-image)' }} />
                    : <div style={{
                        width:      80, height: 80, borderRadius: '50%',
                        background: 'var(--ds-primary-light, rgba(37,99,235,0.10))',
                        display:    'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize:   '1.75rem', fontWeight: 700,
                        color:      'var(--ds-primary, var(--color-primary))',
                      }}>
                        {name.charAt(0) || '?'}
                      </div>
                  }
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, color: 'var(--ds-text, var(--color-text))', fontSize: '0.9375rem' }}>
                      {name}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--ds-muted, var(--color-muted))', marginTop: '0.2rem' }}>{role}</p>
                  </div>
                </AnimatedElement>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
