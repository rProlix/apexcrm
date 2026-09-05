'use client'
// components/site/sections/ContactSection.tsx
// Client component — uses onSubmit form handler
import type { ContactContent } from '@/lib/website/types'
import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content: ContactContent
  componentAnimations?: SectionComponentAnimations
}

export function ContactSection({ content, componentAnimations: ca }: Props) {
  const c = (content && typeof content === 'object' ? content : {}) as Partial<ContactContent>
  const { headline, body, email, phone, address } = c
  const showForm = c.showForm === true && Boolean(email)

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name') ?? '').trim()
    const replyTo = String(data.get('email') ?? '').trim()
    const message = String(data.get('message') ?? '').trim()
    const subject = encodeURIComponent(`Website enquiry${name ? ` from ${name}` : ''}`)
    const mailBody = encodeURIComponent(
      [name ? `Name: ${name}` : '', replyTo ? `Email: ${replyTo}` : '', '', message]
        .filter(Boolean)
        .join('\n')
    )
    window.location.href = `mailto:${email}?subject=${subject}&body=${mailBody}`
  }

  return (
    <section style={{ padding: 'var(--section-padding-desk, 5rem 1.5rem)' }}>
      <div
        style={{
          maxWidth: 900,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: showForm ? 'repeat(auto-fit, minmax(280px, 1fr))' : '1fr',
          gap: '3rem',
        }}
      >
        {/* Info column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {headline && (
            <AnimatedElement
              as="h2"
              animConfig={ca?.heading ?? ca?.text}
              style={{
                fontSize: 'clamp(1.5rem, 3vw, 2rem)',
                fontWeight: 700,
                fontFamily: 'var(--font-heading)',
                color: 'var(--ds-text, var(--color-text))',
                margin: 0,
              }}
            >
              {headline}
            </AnimatedElement>
          )}
          {body && (
            <AnimatedElement
              as="p"
              animConfig={ca?.paragraph ?? ca?.text}
              index={1}
              style={{ color: 'var(--ds-muted, var(--color-muted))', lineHeight: 1.6, margin: 0 }}
            >
              {body}
            </AnimatedElement>
          )}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}
          >
            {email && (
              <a
                href={`mailto:${email}`}
                style={{ color: 'var(--ds-primary, var(--color-primary))', fontSize: '0.9375rem' }}
              >
                {email}
              </a>
            )}
            {phone && (
              <a
                href={`tel:${phone}`}
                style={{ color: 'var(--ds-primary, var(--color-primary))', fontSize: '0.9375rem' }}
              >
                {phone}
              </a>
            )}
            {address && (
              <p
                style={{
                  color: 'var(--ds-muted, var(--color-muted))',
                  fontSize: '0.9375rem',
                  margin: 0,
                }}
              >
                {address}
              </p>
            )}
          </div>
        </div>

        {/* A lightweight, functional email enquiry form. */}
        {showForm && (
          <form
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
            onSubmit={handleSubmit}
          >
            <label style={fieldLabelStyle}>
              Name
              <input
                name="name"
                autoComplete="name"
                required
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9375rem',
                  color: 'var(--color-text)',
                  outline: 'none',
                }}
              />
            </label>
            <label style={fieldLabelStyle}>
              Email
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9375rem',
                  color: 'var(--color-text)',
                  outline: 'none',
                }}
              />
            </label>
            <label style={fieldLabelStyle}>
              Message
              <textarea
                name="message"
                rows={4}
                required
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '0.75rem',
                  padding: '0.75rem 1rem',
                  fontSize: '0.9375rem',
                  color: 'var(--color-text)',
                  outline: 'none',
                  resize: 'vertical',
                }}
              />
            </label>
            <button
              type="submit"
              style={{
                background: 'var(--ds-primary, var(--color-primary))',
                color: 'var(--ds-primary-text, var(--color-primary-foreground))',
                border: 'none',
                borderRadius: '0.75rem',
                padding: '0.75rem 1.5rem',
                fontWeight: 600,
                fontSize: '0.9375rem',
                cursor: 'pointer',
              }}
            >
              Send enquiry
            </button>
          </form>
        )}
      </div>
    </section>
  )
}

const fieldLabelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  color: 'var(--ds-text, var(--color-text))',
  fontSize: '0.875rem',
  fontWeight: 600,
}
