'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { signupSchema, slugifyBusinessName } from '@/lib/validation/auth'
import { createTenantForUser } from '@/lib/auth/createTenantForUser'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

type SignupField = 'businessName' | 'slug' | 'email' | 'password' | 'confirmPassword'
type FieldErrors = Partial<Record<SignupField, string>>

interface FieldProps {
  id:            string
  label:         string
  type?:         string
  value:         string
  onChange:      (v: string) => void
  placeholder?:  string
  autoComplete?: string
  hint?:         string
  error?:        string
  disabled?:     boolean
}

function Field({
  id, label, type = 'text', value, onChange,
  placeholder, autoComplete, hint, error, disabled,
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
      {hint && !error && (
        <p className="text-xs text-white/30">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

export function SignupForm() {
  const router = useRouter()

  const [businessName,     setBusinessName]     = useState('')
  const [slug,             setSlug]             = useState('')
  const [email,            setEmail]            = useState('')
  const [password,         setPassword]         = useState('')
  const [confirmPassword,  setConfirmPassword]  = useState('')
  const [loading,          setLoading]          = useState(false)
  const [error,            setError]            = useState<string | null>(null)
  const [fields,           setFields]           = useState<FieldErrors>({})
  const [emailSent,        setEmailSent]        = useState(false)

  // Derive slug preview from business name when user hasn't typed a custom slug
  const slugPreview = slug.trim() || (businessName ? slugifyBusinessName(businessName) : '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFields({})

    const parsed = signupSchema.safeParse({
      businessName,
      slug:            slug.trim() || undefined,
      email,
      password,
      confirmPassword,
    })

    if (!parsed.success) {
      const errs: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as SignupField
        if (!errs[key]) errs[key] = issue.message
      }
      setFields(errs)
      return
    }

    setLoading(true)

    const supabase = getSupabaseBrowserClient()

    // Step 1: Create the Supabase Auth user.
    // We set role + businessName in user_metadata here so the JWT is correct
    // immediately. The server action (createTenantForUser) overwrites these via
    // the Admin API once the workspace is created, which is the authoritative value.
    const { data, error: signUpError } = await supabase.auth.signUp({
      email:    parsed.data.email,
      password: parsed.data.password,
      options:  {
        data: {
          role:         'admin',
          businessName: parsed.data.businessName,
        },
      },
    })

    if (signUpError) {
      setError(
        signUpError.message.toLowerCase().includes('already registered')
          ? 'An account with this email already exists. Try signing in instead.'
          : signUpError.message
      )
      setLoading(false)
      return
    }

    if (!data.user) {
      setError('Signup failed. Please try again.')
      setLoading(false)
      return
    }

    // Step 2: Create tenant + user profile on the server.
    // Always do this before checking for a session so the workspace exists
    // even when Supabase requires email confirmation and data.session is null.
    try {
      await createTenantForUser({
        authUserId:   data.user.id,
        email:        parsed.data.email,
        businessName: parsed.data.businessName,
        slug:         parsed.data.slug || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set up your workspace.')
      setLoading(false)
      return
    }

    // If email confirmation is required, the session is null — show the
    // "check your email" screen. The tenant is already created so when
    // the user confirms and signs in, the dashboard will load correctly.
    if (!data.session) {
      setEmailSent(true)
      setLoading(false)
      return
    }

    router.push('/dashboard')
  }

  if (emailSent) {
    return (
      <div className="glass-surface premium-border noise-overlay p-8 shadow-panel-lg text-center">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-gold-gradient items-center justify-center mb-5 shadow-glow-gold">
          <span className="text-2xl">✉</span>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
        <p className="text-sm text-white/50 mb-6 leading-relaxed">
          We sent a confirmation link to{' '}
          <span className="text-white/80 font-medium">{email}</span>.
          Click the link to activate your account and continue to your dashboard.
        </p>
        <p className="text-xs text-white/25">
          Already confirmed?{' '}
          <Link href="/login" className="text-gold-400 hover:text-gold-300 transition-colors">
            Sign in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="glass-surface premium-border noise-overlay p-8 shadow-panel-lg">
      {/* Logo mark */}
      <div className="text-center mb-8">
        <div className="inline-flex h-12 w-12 rounded-2xl bg-gold-gradient items-center justify-center mb-4 shadow-glow-gold">
          <span className="text-graphite-900 font-bold text-lg">A</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Create your workspace</h1>
        <p className="text-sm text-white/40 mt-1">Get started with ApexCRM — free 14-day trial</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field
          id="businessName"
          label="Business name"
          autoComplete="organization"
          value={businessName}
          onChange={setBusinessName}
          placeholder="Apex Auto Group"
          error={fields.businessName}
          disabled={loading}
        />

        <div className="space-y-1.5">
          <label
            htmlFor="slug"
            className="block text-xs font-medium text-white/50 uppercase tracking-wider"
          >
            Workspace slug{' '}
            <span className="normal-case text-white/25 font-normal">(optional)</span>
          </label>
          <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-graphite-600 focus-within:border-gold-500/50 transition-colors duration-150 bg-graphite-800">
            <span className="px-3 text-xs text-white/30 select-none shrink-0 border-r border-graphite-600">
              crm.app/
            </span>
            <input
              id="slug"
              type="text"
              autoComplete="off"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={loading}
              placeholder={slugPreview || 'apex-auto'}
              className={cn(
                'flex-1 h-11 px-3 bg-transparent text-white text-sm',
                'placeholder:text-white/20 focus:outline-none',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          </div>
          {!fields.slug && slugPreview && (
            <p className="text-xs text-white/30">
              Your workspace will be at{' '}
              <span className="text-white/50 font-mono">{slugPreview}</span>
            </p>
          )}
          {fields.slug && (
            <p className="text-xs text-red-400">{fields.slug}</p>
          )}
        </div>

        <div className="h-px bg-white/[0.06]" />

        <Field
          id="email"
          label="Work email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="you@yourcompany.com"
          error={fields.email}
          disabled={loading}
        />

        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          hint="Must be at least 8 characters with one uppercase letter and one number."
          error={fields.password}
          disabled={loading}
        />

        <Field
          id="confirmPassword"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={setConfirmPassword}
          placeholder="••••••••"
          error={fields.confirmPassword}
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
          Create workspace
        </Button>

        <p className="text-center text-xs text-white/25 pt-1">
          By signing up you agree to our{' '}
          <span className="text-white/40">Terms of Service</span>
          {' & '}
          <span className="text-white/40">Privacy Policy</span>.
        </p>
      </form>

      <div className="mt-6 pt-6 border-t border-white/[0.06] text-center space-y-3">
        <p className="text-xs text-white/35">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-gold-400 hover:text-gold-300 font-medium transition-colors"
          >
            Sign in
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
