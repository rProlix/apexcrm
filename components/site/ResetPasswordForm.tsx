'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { customerResetPassword } from '@/lib/actions/customer-auth'

interface Props {
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

export function ResetPasswordForm({ loginHref }: Props) {
  const [state, action, pending] = useActionState(customerResetPassword, null)

  if (state?.message) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✅</div>
        <h2 style={{ fontWeight: 700, color: 'var(--color-text)', marginBottom: '0.75rem', fontSize: '1.25rem' }}>
          Password updated
        </h2>
        <p style={{ color: 'var(--color-muted)', lineHeight: 1.6, margin: '0 0 1.5rem' }}>
          {state.message}
        </p>
        <Link href={loginHref} style={{
          display: 'inline-block', background: 'var(--color-primary)', color: '#fff',
          padding: '0.75rem 1.75rem', borderRadius: '0.75rem', fontWeight: 700,
          textDecoration: 'none', fontSize: '0.9375rem',
        }}>
          Sign In
        </Link>
      </div>
    )
  }

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
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
        <label htmlFor="password" style={labelStyle}>New password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="Min. 6 characters"
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="confirm_password" style={labelStyle}>Confirm password</label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={6}
          placeholder="Re-enter your new password"
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
        {pending ? 'Updating password…' : 'Update Password'}
      </button>
    </form>
  )
}
