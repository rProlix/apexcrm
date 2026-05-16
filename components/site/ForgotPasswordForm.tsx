'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { customerForgotPassword } from '@/lib/actions/customer-auth'

interface Props {
  tenantId:  string
  loginHref: string
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

export function ForgotPasswordForm({ tenantId, loginHref }: Props) {
  const [state, action, pending] = useActionState(customerForgotPassword, null)

  if (state?.message) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>📬</div>
        <h2 style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.75rem', fontSize: '1.25rem' }}>
          Check your inbox
        </h2>
        <p style={{ color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
          {state.message}
        </p>
        <Link href={loginHref} style={{ color: 'var(--color-primary)', fontWeight: 600, textDecoration: 'none' }}>
          Back to Sign In
        </Link>
      </div>
    )
  }

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <input type="hidden" name="tenant_id" value={tenantId} />

      {state?.error && (
        <div role="alert" style={{
          background: '#fef2f2', border: '1px solid #fecaca',
          borderRadius: '0.625rem', padding: '0.75rem 1rem',
          color: '#dc2626', fontSize: '0.875rem',
        }}>
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" style={labelStyle}>Email address</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
          style={inputStyle}
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        style={{
          width: '100%', padding: '0.875rem', borderRadius: '0.75rem', border: 'none',
          background: pending ? 'var(--color-muted)' : 'var(--color-primary)',
          color: '#fff', fontSize: '1rem', fontWeight: 700,
          cursor: pending ? 'not-allowed' : 'pointer',
          opacity: pending ? 0.7 : 1,
        }}
      >
        {pending ? 'Sending reset link…' : 'Send Reset Link'}
      </button>

      <p style={{ textAlign: 'center', margin: 0, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
        <Link href={loginHref} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Back to Sign In
        </Link>
      </p>
    </form>
  )
}
