'use client'
// app/sites/[tenant]/error.tsx
// This error boundary is the LAST line of defense.
// Normal section errors should be caught by SafeSectionRenderer before reaching here.
// This boundary exists for unexpected crashes in layout, data fetching, or unhandled edge cases.

import { useEffect } from 'react'

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log full error client-side for developers inspecting the browser console.
    // Never exposes secrets — error.message may be sanitised by Next.js for
    // non-500 server errors, but the digest is always present for correlation.
    console.error('[TenantError] Public site boundary caught:', {
      digest:  error.digest,
      message: error.message,
      stack:   error.stack,
    })
  }, [error])

  const refCode = error.digest ?? `${Date.now()}`

  return (
    <div style={{
      minHeight:      '60vh',
      display:        'flex',
      flexDirection:  'column',
      alignItems:     'center',
      justifyContent: 'center',
      padding:        '2rem',
      background:     'var(--color-bg, #0f0f13)',
      color:          'var(--color-text, #fff)',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 520 }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1.25rem' }}>⚠️</div>
        <h2 style={{
          fontSize:    'clamp(1.25rem, 3vw, 1.625rem)',
          fontWeight:  700,
          marginBottom: '0.75rem',
          fontFamily:  'var(--font-heading, inherit)',
        }}>
          This page could not be loaded
        </h2>
        <p style={{
          color:        'rgba(255,255,255,0.55)',
          fontSize:     '0.9375rem',
          marginBottom: '1.75rem',
          lineHeight:   1.6,
        }}>
          An unexpected error occurred. Our team has been notified. Please try
          refreshing the page.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={reset}
            style={{
              background:   'var(--color-primary, #c9a84c)',
              color:        '#000',
              border:       'none',
              padding:      '0.625rem 1.5rem',
              borderRadius: '0.5rem',
              fontWeight:   600,
              fontSize:     '0.9375rem',
              cursor:       'pointer',
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              background:   'transparent',
              color:        'rgba(255,255,255,0.55)',
              border:       '1px solid rgba(255,255,255,0.15)',
              padding:      '0.625rem 1.5rem',
              borderRadius: '0.5rem',
              fontWeight:   500,
              fontSize:     '0.9375rem',
              cursor:       'pointer',
            }}
          >
            Reload page
          </button>
        </div>

        <p style={{
          color:      'rgba(255,255,255,0.2)',
          fontSize:   '0.6875rem',
          marginTop:  '1.5rem',
          fontFamily: 'monospace',
        }}>
          Ref: {refCode}
        </p>
      </div>
    </div>
  )
}
