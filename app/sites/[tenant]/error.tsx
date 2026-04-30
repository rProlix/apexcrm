'use client'

import { useEffect } from 'react'

export default function TenantError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[TenantError]', error)
  }, [error])

  return (
    <div style={{
      minHeight: '60vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem',
      background: '#0f0f13',
      color: '#fff',
    }}>
      <div style={{ textAlign: 'center', maxWidth: 480 }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          This page could not be loaded
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
          An unexpected error occurred. Please try again.
        </p>
        {error.digest && (
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.75rem', marginBottom: '1rem', fontFamily: 'monospace' }}>
            Ref: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          style={{
            background: '#c9a84c',
            color: '#000',
            border: 'none',
            padding: '0.5rem 1.25rem',
            borderRadius: '0.5rem',
            fontWeight: 600,
            fontSize: '0.875rem',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </div>
    </div>
  )
}
