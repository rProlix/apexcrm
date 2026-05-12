'use client'
// components/site/sections/ContactSection.tsx
// Client component — uses onSubmit form handler
import type { ContactContent } from '@/lib/website/types'
import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content:              ContactContent
  componentAnimations?: SectionComponentAnimations
}

export function ContactSection({ content, componentAnimations: ca }: Props) {
  const c = (content && typeof content === 'object' ? content : {}) as Partial<ContactContent>
  const { headline, body, email, phone, address } = c

  return (
    <section style={{ padding: '5rem 1.5rem', background: 'var(--color-bg)' }}>
      <div style={{
        maxWidth:            900,
        margin:              '0 auto',
        display:             'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap:                 '3rem',
      }}>
        {/* Info column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {headline && (
            <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
              fontSize:   'clamp(1.5rem, 3vw, 2rem)',
              fontWeight: 700,
              fontFamily: 'var(--font-heading)',
              color:      'var(--color-text)',
              margin:     0,
            }}>{headline}</AnimatedElement>
          )}
          {body && (
            <AnimatedElement as="p" animConfig={ca?.paragraph ?? ca?.text} index={1} style={{ color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>{body}</AnimatedElement>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
            {email && (
              <a href={`mailto:${email}`} style={{ color: 'var(--color-primary)', fontSize: '0.9375rem' }}>
                {email}
              </a>
            )}
            {phone && (
              <a href={`tel:${phone}`} style={{ color: 'var(--color-primary)', fontSize: '0.9375rem' }}>
                {phone}
              </a>
            )}
            {address && (
              <p style={{ color: 'var(--color-muted)', fontSize: '0.9375rem', margin: 0 }}>{address}</p>
            )}
          </div>
        </div>

        {/* Simple contact form */}
        <form
          style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          onSubmit={(e) => e.preventDefault()}
        >
          <input
            placeholder="Your name"
            style={{
              background:    'var(--color-surface)',
              border:        '1px solid var(--color-border)',
              borderRadius:  '0.75rem',
              padding:       '0.75rem 1rem',
              fontSize:      '0.9375rem',
              color:         'var(--color-text)',
              outline:       'none',
            }}
          />
          <input
            type="email"
            placeholder="Email address"
            style={{
              background:    'var(--color-surface)',
              border:        '1px solid var(--color-border)',
              borderRadius:  '0.75rem',
              padding:       '0.75rem 1rem',
              fontSize:      '0.9375rem',
              color:         'var(--color-text)',
              outline:       'none',
            }}
          />
          <textarea
            placeholder="Message"
            rows={4}
            style={{
              background:    'var(--color-surface)',
              border:        '1px solid var(--color-border)',
              borderRadius:  '0.75rem',
              padding:       '0.75rem 1rem',
              fontSize:      '0.9375rem',
              color:         'var(--color-text)',
              outline:       'none',
              resize:        'vertical',
            }}
          />
          <button
            type="submit"
            style={{
              background:   'var(--color-primary)',
              color:        '#fff',
              border:       'none',
              borderRadius: '0.75rem',
              padding:      '0.75rem 1.5rem',
              fontWeight:   600,
              fontSize:     '0.9375rem',
              cursor:       'pointer',
            }}
          >
            Send Message
          </button>
        </form>
      </div>
    </section>
  )
}
