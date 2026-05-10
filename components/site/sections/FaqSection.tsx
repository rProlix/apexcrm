'use client'
// components/site/sections/FaqSection.tsx
import { useState } from 'react'
import type { FaqContent } from '@/lib/website/types'

interface Props { content: FaqContent }

export function FaqSection({ content }: Props) {
  const c        = (content && typeof content === 'object' ? content : {}) as Partial<FaqContent>
  const headline = typeof c.headline === 'string' ? c.headline : ''
  const items    = Array.isArray(c.items) ? c.items : []
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
          {items.map((item, i) => {
            const question = typeof item?.question === 'string' ? item.question : ''
            const answer   = typeof item?.answer === 'string'   ? item.answer   : ''
            if (!question) return null
            return (
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
                {question}
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
                  {answer}
                </div>
              )}
            </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
