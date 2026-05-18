'use client'
// components/site/sections/FaqSection.tsx
import { useState } from 'react'
import type { FaqContent } from '@/lib/website/types'
import { AnimatedElement } from '@/components/site/AnimatedElement'
import type { SectionComponentAnimations } from '@/components/site/SafeSectionRenderer'

interface Props {
  content:              FaqContent
  componentAnimations?: SectionComponentAnimations
}

export function FaqSection({ content, componentAnimations: ca }: Props) {
  const c        = (content && typeof content === 'object' ? content : {}) as Partial<FaqContent>
  const headline = typeof c.headline === 'string' ? c.headline : ''
  const items    = Array.isArray(c.items) ? c.items : []
  const [open, setOpen] = useState<number | null>(null)

  if (items.length === 0) return null

  return (
    <section style={{ padding: 'var(--section-padding-desk, 5rem 1.5rem)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {headline && (
          <AnimatedElement as="h2" animConfig={ca?.heading ?? ca?.text} style={{
            textAlign:     'center',
            fontSize:      'clamp(1.5rem, 3vw, 2.5rem)',
            fontWeight:    'var(--font-weight-heading, 700)' as React.CSSProperties['fontWeight'],
            fontFamily:    'var(--font-heading)',
            letterSpacing: 'var(--letter-spacing, -0.02em)',
            color:         'var(--ds-text, var(--color-text))',
            margin:        '0 0 3.5rem',
          }}>{headline}</AnimatedElement>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {items.map((item, i) => {
            const question = typeof item?.question === 'string' ? item.question : ''
            const answer   = typeof item?.answer === 'string'   ? item.answer   : ''
            if (!question) return null
            return (
            <AnimatedElement key={i} animConfig={ca?.card} index={i} style={{
              border:       '1px solid var(--ds-border, var(--color-border))',
              borderRadius: 'var(--radius-card, 0.875rem)',
              overflow:     'hidden',
              background:   'var(--ds-surface, var(--color-surface))',
              boxShadow:    'var(--shadow-card)',
            }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width:          '100%',
                  padding:        '1.25rem 1.625rem',
                  textAlign:      'left',
                  display:        'flex',
                  justifyContent: 'space-between',
                  alignItems:     'center',
                  gap:            '1rem',
                  background:     'transparent',
                  border:         'none',
                  cursor:         'pointer',
                  color:          'var(--ds-text, var(--color-text))',
                  fontSize:       '1rem',
                  fontWeight:     600,
                  lineHeight:     1.4,
                }}
              >
                {question}
                <span style={{
                  fontSize:    '1.25rem',
                  flexShrink:  0,
                  color:       'var(--ds-primary, var(--color-primary))',
                  transform:   open === i ? 'rotate(45deg)' : 'none',
                  transition:  'transform 0.22s ease',
                  fontWeight:  300,
                }}>+</span>
              </button>
              {open === i && (
                <div style={{
                  padding:    '0 1.625rem 1.5rem',
                  fontSize:   '0.9375rem',
                  color:      'var(--ds-muted, var(--color-muted))',
                  lineHeight: 'var(--line-height, 1.65)',
                  borderTop:  '1px solid var(--ds-border, var(--color-border))',
                  paddingTop: '1rem',
                }}>
                  {answer}
                </div>
              )}
            </AnimatedElement>
            )
          })}
        </div>
      </div>
    </section>
  )
}
