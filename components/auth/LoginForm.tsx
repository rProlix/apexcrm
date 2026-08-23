'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { loginSchema } from '@/lib/validation/auth'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { InlineNotice } from '@/components/ui/InlineNotice'

type FieldErrors = Partial<Record<'email' | 'password', string>>

type LoginFormProps = {
  nextPath?: string
}

export function LoginForm({ nextPath = '/dashboard' }: LoginFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFields({})

    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      const errs: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        errs[key] = issue.message
      }
      setFields(errs)
      return
    }

    setLoading(true)

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: parsed.data.email,
        password: parsed.data.password,
      }),
    })

    if (!response.ok) {
      const result = (await response.json().catch(() => null)) as { error?: string } | null
      setError(result?.error ?? 'Unable to sign in. Please try again.')
      setLoading(false)
      return
    }

    // Hard redirect — forces a full page load so the browser sends the
    // newly set auth cookies in the very first request to the dashboard.
    // router.push() does a soft client-side nav which can race against
    // cookie storage, causing the server component to see no session.
    window.location.href = nextPath
  }

  return (
    <div className="glass-surface premium-border noise-overlay p-8 shadow-panel-lg">
      {/* Logo mark */}
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 rounded-2xl bg-gold-gradient items-center justify-center mb-4 shadow-glow-gold">
          <span className="text-graphite-900 font-bold text-lg">A</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Welcome back</h1>
        <p className="text-sm text-white/40 mt-1">Sign in to your CRM workspace</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          id="email"
          label="Email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          error={fields.email}
          disabled={loading}
        />

        <TextField
          id="password"
          label="Password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="••••••••"
          error={fields.password}
          disabled={loading}
        />

        {error && (
          <InlineNotice tone="error">
            <span>{error}</span>
          </InlineNotice>
        )}

        <Button type="submit" loading={loading} className="w-full mt-2" size="lg">
          Sign in
        </Button>
      </form>

      <div className="mt-6 pt-6 border-t border-white/[0.06] text-center space-y-3">
        <p className="text-xs text-white/35">
          Don&apos;t have an account?{' '}
          <Link
            href="/signup"
            className="text-gold-400 hover:text-gold-300 font-medium transition-colors"
          >
            Create one free
          </Link>
        </p>
        <p className="text-xs text-white/30">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-white/60"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
