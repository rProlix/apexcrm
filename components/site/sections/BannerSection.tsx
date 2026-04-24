'use client'
// components/site/sections/BannerSection.tsx
import { useState } from 'react'
import Link from 'next/link'
import type { BannerContent } from '@/lib/website/types'

interface Props { content: BannerContent }

const variantStyles: Record<string, React.CSSProperties> = {
  promo:   { background: 'var(--color-primary)',   color: '#fff' },
  info:    { background: '#1e40af',                color: '#fff' },
  warning: { background: '#d97706',                color: '#fff' },
}

export function BannerSection({ content }: Props) {
  const { text, ctaLabel, ctaHref, variant = 'promo', dismissible } = content
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  const style = variantStyles[variant] ?? variantStyles.promo

  return (
    <div style={{
      ...style,
      padding:        '0.75rem 1.5rem',
      textAlign:      'center',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      gap:            '1rem',
      position:       'relative',
    }}>
      <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{text}</span>
      {ctaLabel && (
        <Link href={ctaHref || '/'} style={{
          background:     'rgba(255,255,255,0.2)',
          color:          'inherit',
          padding:        '0.25rem 0.875rem',
          borderRadius:   '99px',
          fontSize:       '0.8125rem',
          fontWeight:     600,
          textDecoration: 'none',
        }}>
          {ctaLabel}
        </Link>
      )}
      {dismissible && (
        <button
          onClick={() => setDismissed(true)}
          style={{
            position:   'absolute',
            right:      '1rem',
            top:        '50%',
            transform:  'translateY(-50%)',
            background: 'none',
            border:     'none',
            color:      'inherit',
            opacity:    0.7,
            cursor:     'pointer',
            fontSize:   '1.125rem',
            lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  )
}
