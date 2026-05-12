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
              <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
                fontSize:   'clamp(1.5rem, 3vw, 2.25rem)',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                color:      'var(--color-text)',
                margin:     0,
              }}>
                {headline}
              </AnimatedElement>
            )}
            {body && (
              <AnimatedElement as="p" animConfig={ca?.paragraph ?? ca?.text} index={1} style={{
                color: 'var(--color-muted)', lineHeight: 1.75, margin: 0, fontSize: '1rem',
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
                height={400}
                unoptimized
                style={{ width: '100%', borderRadius: '1rem', objectFit: 'cover', maxHeight: 400 }}
              />
            </AnimatedElement>
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
              const name   = typeof member?.name === 'string'   ? member.name   : ''
              const role   = typeof member?.role === 'string'   ? member.role   : ''
              const avatar = typeof member?.avatar === 'string' ? member.avatar : null
              return (
                <AnimatedElement key={i} animConfig={ca?.card} index={i} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem', textAlign: 'center',
                }}>
                  {avatar
                    ? <Image src={avatar} alt={name} width={80} height={80} unoptimized
                        style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover' }} />
                    : <div style={{
                        width: 80, height: 80, borderRadius: '50%', background: 'var(--color-border)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.75rem',
                      }}>
                        {name.charAt(0) || '?'}
                      </div>
                  }
                  <div>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--color-text)', fontSize: '0.9375rem' }}>
                      {name}
                    </p>
                    <p style={{ margin: 0, fontSize: '0.8125rem', color: 'var(--color-muted)' }}>{role}</p>
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
