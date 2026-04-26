'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { loginSchema } from '@/lib/validation/auth'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

type FieldErrors = Partial<Record<'email' | 'password', string>>

interface FieldProps {
  id:           string
  label:        string
  type?:        string
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  autoComplete?: string
  error?:       string
  disabled?:    boolean
}

function Field({
  id, label, type = 'text', value, onChange,
  placeholder, autoComplete, error, disabled,
}: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-white/50 uppercase tracking-wider"
      >
        {label}
      </label>
      <input
        id={id}
        type={type}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          'w-full h-11 px-4 rounded-xl bg-graphite-800 border text-white text-sm',
          'placeholder:text-white/25 focus:outline-none transition-colors duration-150',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          error
            ? 'border-red-500/50 focus:border-red-500/70'
            : 'border-graphite-600 focus:border-gold-500/50'
        )}
      />
      {error && (
        <p className="text-xs text-red-400 mt-1">{error}</p>
      )}
    </div>
  )
}

export function LoginForm() {
  const router = useRouter()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [fields,   setFields]   = useState<FieldErrors>({})

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

    const supabase = getSupabaseBrowserClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email:    parsed.data.email,
      password: parsed.data.password,
    })

    if (authError) {
      setError(
        authError.message === 'Invalid login credentials'
          ? 'Incorrect email or password. Please try again.'
          : authError.message
      )
      setLoading(false)
      return
    }

    router.push('/dashboard')
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
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="you@example.com"
          error={fields.email}
          disabled={loading}
        />

        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          error={fields.password}
          disabled={loading}
        />

        {error && (
          <div className="flex items-start gap-2.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <span className="mt-0.5 shrink-0">⚠</span>
            <span>{error}</span>
          </div>
        )}

        <Button
          type="submit"
          loading={loading}
          className="w-full mt-2"
          size="lg"
        >
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
        <p className="text-xs text-white/20">
          <Link href="/" className="hover:text-white/40 transition-colors">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  )
}
