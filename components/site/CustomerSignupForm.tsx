'use client'

// components/site/CustomerSignupForm.tsx
//
// Storefront customer signup form.
//
// Previously called the `customerSignup` server action which could not reliably
// derive the storefront host in all Vercel/proxy configurations.
//
// This version POSTs to /api/storefront/auth/signup on the same origin the
// browser is currently on. Because the API route receives an HTTP Request, it
// can read new URL(request.url).origin to get the exact subdomain or custom
// domain, and pass that as emailRedirectTo to Supabase — so confirmation emails
// always link back to the business storefront, not to nexoranow.com.

import { useState, FormEvent } from 'react'
import Link from 'next/link'

interface Props {
  tenantId:  string
  loginHref: string
  next:      string
}

const inputStyle: React.CSSProperties = {
  width:        '100%',
  padding:      '0.75rem 1rem',
  borderRadius: '0.625rem',
  border:       '1px solid var(--color-border)',
  background:   'var(--color-surface)',
  color:        'var(--color-text)',
  fontSize:     '1rem',
  outline:      'none',
  boxSizing:    'border-box',
}

const labelStyle: React.CSSProperties = {
  display:      'block',
  fontSize:     '0.8125rem',
  fontWeight:   600,
  color:        'var(--color-muted)',
  marginBottom: '0.375rem',
}

export function CustomerSignupForm({ tenantId, loginHref, next }: Props) {
  const [fullName,  setFullName]  = useState('')
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [pending,   setPending]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [message,   setMessage]   = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setMessage(null)
    setDebugInfo(null)
    setPending(true)

    try {
      // POST to the same origin the browser is on.
      // If the page is on erickvcontacf.nexoranow.com, this request goes to
      // erickvcontacf.nexoranow.com/api/storefront/auth/signup — so the route
      // handler sees request.url with the correct subdomain host.
      const res = await fetch('/api/storefront/auth/signup', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email,
          password,
          full_name: fullName,
          tenant_id: tenantId,
          next,
        }),
      })

      const data = await res.json()

      if (!data.ok) {
        setError(data.error ?? 'Sign up failed. Please try again.')
        return
      }

      if (data.confirmed && data.next) {
        // Email confirmation is disabled in Supabase — session was returned
        // immediately. Redirect the customer directly to their account page.
        if (data._warning) {
          console.warn('[CustomerSignupForm]', data._warning)
        }
        window.location.href = data.next
        return
      }

      setMessage(
        data.message ??
        'We sent a confirmation email to your inbox. Click the link to activate your account, then sign in.',
      )

      // Show debug info in non-production (API includes it only in dev)
      if (data._debug?.emailRedirectTo) {
        setDebugInfo(`Debug: emailRedirectTo = ${data._debug.emailRedirectTo}`)
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setPending(false)
    }
  }

  if (message) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📬</div>
        <h2 style={{
          fontWeight:   700,
          color:        'var(--color-text)',
          marginBottom: '0.75rem',
          fontSize:     '1.25rem',
        }}>
          Check your inbox
        </h2>
        <p style={{ color: 'var(--color-muted)', lineHeight: 1.6, margin: 0 }}>
          {message}
        </p>
        {debugInfo && (
          <p style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9ca3af', fontFamily: 'monospace' }}>
            {debugInfo}
          </p>
        )}
        <Link
          href={loginHref}
          style={{
            display:        'inline-block',
            marginTop:      '1.5rem',
            color:          'var(--color-primary)',
            fontWeight:     600,
            fontSize:       '0.9375rem',
            textDecoration: 'none',
          }}
        >
          Back to Sign In
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {error && (
        <div role="alert" style={{
          background:   '#fef2f2',
          border:       '1px solid #fecaca',
          borderRadius: '0.625rem',
          padding:      '0.75rem 1rem',
          color:        '#dc2626',
          fontSize:     '0.875rem',
        }}>
          {error}
        </div>
      )}

      <div>
        <label htmlFor="full_name" style={labelStyle}>Full Name</label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          placeholder="Jane Smith"
          value={fullName}
          onChange={e => setFullName(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="email" style={labelStyle}>Email</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="password" style={labelStyle}>Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="Min. 6 characters"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{
          width:        '100%',
          padding:      '0.875rem',
          borderRadius: '0.75rem',
          border:       'none',
          background:   pending ? 'var(--color-muted)' : 'var(--color-primary)',
          color:        '#fff',
          fontSize:     '1rem',
          fontWeight:   700,
          cursor:       pending ? 'not-allowed' : 'pointer',
          transition:   'opacity 0.15s',
          opacity:      pending ? 0.7 : 1,
        }}
      >
        {pending ? 'Creating account…' : 'Create Account'}
      </button>

      <p style={{ textAlign: 'center', margin: 0, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
        Already have an account?{' '}
        <Link href={loginHref} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </form>
  )
}
