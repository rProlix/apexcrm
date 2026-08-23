'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MailCheck } from 'lucide-react'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import { signupSchema, slugifyBusinessName } from '@/lib/validation/auth'
import { createTenantForUser } from '@/lib/auth/createTenantForUser'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { InlineNotice } from '@/components/ui/InlineNotice'
import { cn } from '@/lib/utils'
import { createLegalAgreement, LEGAL_AGREEMENT_REQUIRED_MESSAGE } from '@/lib/legal/consent'

type SignupField =
  | 'businessName'
  | 'slug'
  | 'email'
  | 'password'
  | 'confirmPassword'
  | 'acceptedLegal'
type FieldErrors = Partial<Record<SignupField, string>>

export function SignupForm() {
  const [businessName, setBusinessName] = useState('')
  const [slug, setSlug] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<FieldErrors>({})
  const [emailSent, setEmailSent] = useState(false)
  const [acceptedLegal, setAcceptedLegal] = useState(false)

  // Derive slug preview from business name when user hasn't typed a custom slug
  const slugPreview = slug.trim() || (businessName ? slugifyBusinessName(businessName) : '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setFields({})

    const parsed = signupSchema.safeParse({
      businessName,
      slug: slug.trim() || undefined,
      email,
      password,
      confirmPassword,
      acceptedLegal,
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
    const legalAgreement = createLegalAgreement()

    // Step 1: Create the Supabase Auth user.
    // We set role + businessName in user_metadata here so the JWT is correct
    // immediately. The server action (createTenantForUser) overwrites these via
    // the Admin API once the workspace is created, which is the authoritative value.
    // emailRedirectTo must be derived from window.location.origin so that
    // confirmation emails link back to the correct domain in every environment:
    //   - nexoranow.com (production)
    //   - *.vercel.app  (preview deployments)
    //   - localhost      (local dev)
    // Never hard-code a domain here — doing so would send all confirmation
    // links to that hard-coded URL even in preview/dev environments.
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent('/dashboard')}`

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: {
          role: 'admin',
          businessName: parsed.data.businessName,
          legal_acceptance: legalAgreement,
        },
        emailRedirectTo,
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
    let tenantSlug = ''
    try {
      const result = await createTenantForUser({
        authUserId: data.user.id,
        email: parsed.data.email,
        businessName: parsed.data.businessName,
        slug: parsed.data.slug || undefined,
        legalAgreement,
      })
      tenantSlug = result.tenantSlug
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

    // Hard redirect — forces a full page load so the newly set auth cookies
    // are included in the very first server request (router.push can race).
    const onboardingParams = new URLSearchParams({
      slug: tenantSlug,
      name: parsed.data.businessName,
    })
    window.location.href = `/onboarding?${onboardingParams.toString()}`
  }

  if (emailSent) {
    return (
      <div className="glass-surface premium-border noise-overlay p-8 shadow-panel-lg text-center">
        <div className="inline-flex h-14 w-14 rounded-2xl bg-gold-gradient items-center justify-center mb-5 shadow-glow-gold">
          <MailCheck className="h-6 w-6 text-graphite-900" strokeWidth={1.75} aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Check your email</h2>
        <p className="text-sm text-white/50 mb-6 leading-relaxed">
          We sent a confirmation link to <span className="font-medium text-white/80">{email}</span>.
          Click it to activate your account and continue to your dashboard.
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
        <p className="mt-1 text-sm text-white/40">Start your 14-day ApexCRM trial.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <TextField
          id="businessName"
          label="Business name"
          required
          autoComplete="organization"
          value={businessName}
          onChange={(event) => setBusinessName(event.target.value)}
          placeholder="Apex Auto Group"
          error={fields.businessName}
          disabled={loading}
        />

        <label
          htmlFor="signup-legal-agreement"
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
            acceptedLegal
              ? 'border-gold-500/45 bg-gold-500/[0.07]'
              : 'border-graphite-600 bg-graphite-800/35 hover:border-graphite-500'
          )}
        >
          <input
            id="signup-legal-agreement"
            type="checkbox"
            checked={acceptedLegal}
            onChange={(event) => setAcceptedLegal(event.target.checked)}
            disabled={loading}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#c9a84c] focus:ring-2 focus:ring-gold-400/50"
          />
          <span className="text-xs leading-5 text-white/55">
            I have authority to bind this business. I agree to the{' '}
            <Link
              href="/legal/terms"
              target="_blank"
              className="font-medium text-gold-400 hover:text-gold-300"
            >
              Terms of Use
            </Link>{' '}
            and{' '}
            <Link
              href="/legal/acceptable-use"
              target="_blank"
              className="font-medium text-gold-400 hover:text-gold-300"
            >
              Acceptable Use Policy
            </Link>
            , including the{' '}
            <Link
              href="/legal/data-processing-addendum"
              target="_blank"
              className="font-medium text-gold-400 hover:text-gold-300"
            >
              Data Processing Addendum
            </Link>
            , and acknowledge the{' '}
            <Link
              href="/legal/privacy"
              target="_blank"
              className="font-medium text-gold-400 hover:text-gold-300"
            >
              Privacy Policy
            </Link>
            ,{' '}
            <Link
              href="/legal/cookie-policy"
              target="_blank"
              className="font-medium text-gold-400 hover:text-gold-300"
            >
              Cookie Policy
            </Link>
            , and{' '}
            <Link
              href="/legal/ai-notice"
              target="_blank"
              className="font-medium text-gold-400 hover:text-gold-300"
            >
              AI Notice
            </Link>
            .
          </span>
        </label>

        {fields.acceptedLegal && (
          <p className="text-xs text-red-400">{LEGAL_AGREEMENT_REQUIRED_MESSAGE}</p>
        )}

        <div className="space-y-1.5">
          <label htmlFor="slug" className="ui-label">
            Workspace slug <span className="font-normal text-white/35">Optional</span>
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
              aria-invalid={Boolean(fields.slug)}
              aria-describedby={fields.slug ? 'slug-error' : slugPreview ? 'slug-hint' : undefined}
              className={cn(
                'flex-1 h-11 px-3 bg-transparent text-white text-sm',
                'placeholder:text-white/20 focus:outline-none',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
            />
          </div>
          {!fields.slug && slugPreview && (
            <p id="slug-hint" className="ui-help">
              Your workspace will be at{' '}
              <span className="text-white/50 font-mono">{slugPreview}</span>
            </p>
          )}
          {fields.slug && (
            <p id="slug-error" className="ui-error" role="alert">
              {fields.slug}
            </p>
          )}
        </div>

        <div className="h-px bg-white/[0.06]" />

        <TextField
          id="email"
          label="Work email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@yourcompany.com"
          error={fields.email}
          disabled={loading}
        />

        <TextField
          id="password"
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Min 8 chars, 1 uppercase, 1 number"
          hint="Must be at least 8 characters with one uppercase letter and one number."
          error={fields.password}
          disabled={loading}
        />

        <TextField
          id="confirmPassword"
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="••••••••"
          error={fields.confirmPassword}
          disabled={loading}
        />

        {error && (
          <InlineNotice tone="error">
            <span>{error}</span>
          </InlineNotice>
        )}

        <Button
          type="submit"
          loading={loading}
          disabled={loading || !acceptedLegal}
          className="w-full mt-2"
          size="lg"
        >
          {loading ? 'Creating your workspace…' : 'Create workspace'}
        </Button>
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
