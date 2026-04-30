'use client'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  console.error('GLOBAL ERROR:', error)

  return (
    <html>
      <body style={{ padding: 20, fontFamily: 'monospace', background: '#0f0f13', color: '#fff' }}>
        <h2 style={{ color: '#ef4444' }}>Something broke</h2>
        <pre style={{ background: '#1a1a22', padding: '1rem', borderRadius: 8, overflowX: 'auto', fontSize: 13 }}>
          {error.message}
        </pre>
        {error.digest && (
          <p style={{ color: '#888', fontSize: 12 }}>Digest: {error.digest}</p>
        )}
      </body>
    </html>
  )
}
