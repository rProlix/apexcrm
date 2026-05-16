'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { customerLogin } from '@/lib/actions/customer-auth'

interface Props {
  tenantId:       string
  signupHref:     string
  forgotHref?:    string
  next:           string
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
  display:    'block',
  fontSize:   '0.8125rem',
  fontWeight: 600,
  color:      'var(--color-muted)',
  marginBottom: '0.375rem',
}

export function CustomerLoginForm({ tenantId, signupHref, forgotHref, next }: Props) {
  const [state, action, pending] = useActionState(customerLogin, null)

  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <input type="hidden" name="tenant_id" value={tenantId} />
      <input type="hidden" name="next"      value={next} />

      {state?.error && (
        <div role="alert" style={{
          background:   '#fef2f2',
          border:       '1px solid #fecaca',
          borderRadius: '0.625rem',
          padding:      '0.75rem 1rem',
          color:        '#dc2626',
          fontSize:     '0.875rem',
        }}>
          {state.error}
        </div>
      )}

      <div>
        <label htmlFor="email" style={labelStyle}>Email</label>
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

      <div>
        <label htmlFor="password" style={labelStyle}>Password</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
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
        {pending ? 'Signing in…' : 'Sign In'}
      </button>

      {forgotHref && (
        <p style={{ textAlign: 'center', margin: '0.25rem 0 0', fontSize: '0.8125rem', color: 'var(--color-muted)' }}>
          <Link href={forgotHref} style={{ color: 'var(--color-muted)', textDecoration: 'underline' }}>
            Forgot password?
          </Link>
        </p>
      )}

      <p style={{ textAlign: 'center', margin: 0, fontSize: '0.875rem', color: 'var(--color-muted)' }}>
        Don&apos;t have an account?{' '}
        <Link href={signupHref} style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Sign up
        </Link>
      </p>
    </form>
  )
}
