'use client'
// components/site/sections/FaqSection.tsx
import { useState } from 'react'
import type { FaqContent } from '@/lib/website/types'

interface Props { content: FaqContent }

export function FaqSection({ content }: Props) {
  const { headline, items = [] } = content
  const [open, setOpen] = useState<number | null>(null)

  if (items.length === 0) return null

  return (
    <section style={{ padding: '5rem 1.5rem', background: 'var(--color-bg)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {items.map((item, i) => (
            <div key={i} style={{
              border:       '1px solid var(--color-border)',
              borderRadius: '0.875rem',
              overflow:     'hidden',
              background:   'var(--color-surface)',
            }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                style={{
                  width:          '100%',
                  padding:        '1.125rem 1.5rem',
                  textAlign:      'left',
                  display:        'flex',
                  justifyContent: 'space-between',
                  alignItems:     'center',
                  gap:            '1rem',
                  background:     'transparent',
                  border:         'none',
                  cursor:         'pointer',
                  color:          'var(--color-text)',
                  fontSize:       '0.9375rem',
                  fontWeight:     600,
                }}
              >
                {item.question}
                <span style={{
                  fontSize:    '1.125rem',
                  flexShrink:  0,
                  color:       'var(--color-muted)',
                  transform:   open === i ? 'rotate(45deg)' : 'none',
                  transition:  'transform 0.2s',
                }}>+</span>
              </button>
              {open === i && (
                <div style={{
                  padding:    '0 1.5rem 1.25rem',
                  fontSize:   '0.9375rem',
                  color:      'var(--color-muted)',
                  lineHeight: 1.6,
                }}>
                  {item.answer}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
