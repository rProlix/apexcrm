'use client'
// components/invite/InviteAcceptClient.tsx
// Client component for the customer invite accept flow.

import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, AlertCircle, CalendarDays, ShoppingBag, Star, CreditCard, User,
  Eye, EyeOff, Loader2, LogIn,
} from 'lucide-react'

interface EnabledModules {
  appointments?: boolean
  orders?:       boolean
  rewards?:      boolean
  payments?:     boolean
  store?:        boolean
}

interface ValidatedInvite {
  id:             string
  email:          string
  fullName:       string | null
  phone:          string | null
  tenantId:       string
  tenantName:     string
  tenantLogo:     string | null
  customerId:     string | null
  expiresAt:      string
  enabledModules: EnabledModules
}

interface Props {
  token:           string
  currentUserEmail?: string | null
}

const MODULE_FEATURES = [
  { key: 'appointments', label: 'Book & manage appointments', Icon: CalendarDays, color: 'text-blue-400' },
  { key: 'orders',       label: 'View your orders & history',  Icon: ShoppingBag,  color: 'text-amber-400' },
  { key: 'rewards',      label: 'Earn & redeem rewards',       Icon: Star,         color: 'text-yellow-400' },
  { key: 'payments',     label: 'View invoices & payments',    Icon: CreditCard,   color: 'text-emerald-400' },
  { key: 'profile',      label: 'Manage your profile',         Icon: User,         color: 'text-white/60',  always: true },
] as const

export function InviteAcceptClient({ token, currentUserEmail }: Props) {
  const router = useRouter()

  const [phase,       setPhase]       = useState<'loading' | 'invalid' | 'valid' | 'form' | 'submitting' | 'success'>('loading')
  const [invite,      setInvite]      = useState<ValidatedInvite | null>(null)
  const [invError,    setInvError]    = useState<string | null>(null)
  const [invCode,     setInvCode]     = useState<string | null>(null)

  // Form state
  const [fullName,     setFullName]     = useState('')
  const [phone,        setPhone]        = useState('')
  const [password,     setPassword]     = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [formError,    setFormError]    = useState<string | null>(null)

  // Validate token on mount
  useEffect(() => {
    async function validate() {
      try {
        const res  = await fetch('/api/customer-invites/validate', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ token }),
        })
        const data = await res.json()
        if (!data.ok) {
          setInvError(data.error ?? 'This invite link is invalid.')
          setInvCode(data.code ?? null)
          setPhase('invalid')
          return
        }
        setInvite(data.invite)
        setFullName(data.invite.fullName ?? '')
        setPhone(data.invite.phone ?? '')

        // If user is already signed in with the correct email, skip password form
        if (currentUserEmail && currentUserEmail.toLowerCase() === data.invite.email.toLowerCase()) {
          setPhase('valid')
        } else {
          setPhase('form')
        }
      } catch {
        setInvError('Failed to validate invite. Please check your connection and try again.')
        setPhase('invalid')
      }
    }
    validate()
  }, [token, currentUserEmail])

  const handleAccept = useCallback(async () => {
    if (!invite) return

    // If in form phase, validate password
    if (phase === 'form') {
      if (!password) { setFormError('Password is required.'); return }
      if (password.length < 6) { setFormError('Password must be at least 6 characters.'); return }
      if (password !== confirmPass) { setFormError('Passwords do not match.'); return }
    }

    setFormError(null)
    setPhase('submitting')

    try {
      const res  = await fetch('/api/customer-invites/accept', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          token,
          password:  phase === 'form' ? password : undefined,
          fullName:  fullName.trim() || undefined,
          phone:     phone.trim() || undefined,
        }),
      })
      const data = await res.json()

      if (!data.ok) {
        setFormError(data.error ?? 'Failed to accept invite. Please try again.')
        setPhase(currentUserEmail ? 'valid' : 'form')
        return
      }

      setPhase('success')

      // Use window.location.href for the redirect because the target URL is the
      // business storefront (e.g. erickvcontacf.nexoranow.com/account), which is
      // a different origin from the current page (nexoranow.com/invite/customer).
      // router.push() cannot navigate cross-origin.
      setTimeout(() => {
        const target = data.redirectTo ?? '/account'
        if (target.startsWith('http://') || target.startsWith('https://')) {
          window.location.href = target
        } else {
          router.push(target)
          router.refresh()
        }
      }, 2000)
    } catch {
      setFormError('Network error. Please check your connection and try again.')
      setPhase(currentUserEmail ? 'valid' : 'form')
    }
  }, [invite, phase, password, confirmPass, token, fullName, phone, currentUserEmail, router])

  // ── Loading ────────────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="flex flex-col items-center gap-4 py-16">
        <Loader2 className="w-8 h-8 text-white/30 animate-spin" />
        <p className="text-sm text-white/40">Validating your invite…</p>
      </div>
    )
  }

  // ── Invalid ────────────────────────────────────────────────────────────────

  if (phase === 'invalid') {
    const isExpired  = invCode === 'INVITE_EXPIRED'
    const isRevoked  = invCode === 'INVITE_REVOKED'
    const isAccepted = invCode === 'INVITE_ACCEPTED'

    return (
      <div className="flex flex-col items-center text-center gap-5 py-8">
        <div className="h-16 w-16 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-2">
            {isExpired  ? 'Invite Expired' :
             isRevoked  ? 'Invite Revoked' :
             isAccepted ? 'Already Accepted' :
             'Invalid Invite'}
          </h2>
          <p className="text-sm text-white/50 leading-relaxed max-w-sm">
            {invError ?? 'This invite link is invalid or no longer available.'}
          </p>
          {(isExpired || isRevoked) && (
            <p className="text-xs text-white/30 mt-3">
              Please contact the business to request a new invite.
            </p>
          )}
          {isAccepted && (
            <a
              href="/portal"
              className="inline-flex items-center gap-2 mt-5 h-10 px-6 rounded-xl text-sm font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold transition-all"
            >
              <LogIn className="w-4 h-4" />
              Go to portal
            </a>
          )}
        </div>
      </div>
    )
  }

  // ── Success ────────────────────────────────────────────────────────────────

  if (phase === 'success') {
    return (
      <div className="flex flex-col items-center text-center gap-5 py-8">
        <div className="h-16 w-16 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-white mb-2">You&apos;re in!</h2>
          <p className="text-sm text-white/50">
            Your account is linked. Redirecting to your portal…
          </p>
        </div>
        <Loader2 className="w-5 h-5 text-white/30 animate-spin" />
      </div>
    )
  }

  // ── Valid invite — show details + form ─────────────────────────────────────

  if (!invite) return null

  const mods = invite.enabledModules
  const enabledFeatures = MODULE_FEATURES.filter(f => f.key === 'profile' || mods[f.key as keyof EnabledModules])

  const isAlreadyLoggedIn = phase === 'valid'
  const isSubmitting      = phase === 'submitting'

  return (
    <div className="space-y-6">
      {/* Business branding */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center mb-4">
          {invite.tenantLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={invite.tenantLogo}
              alt={invite.tenantName}
              className="h-14 w-14 rounded-2xl object-cover border border-white/10"
            />
          ) : (
            <div className="h-14 w-14 rounded-2xl bg-gold-gradient flex items-center justify-center shadow-glow-gold">
              <span className="text-graphite-900 font-bold text-xl">
                {invite.tenantName.slice(0, 2).toUpperCase()}
              </span>
            </div>
          )}
        </div>
        <h1 className="text-2xl font-bold text-white mb-1">
          {invite.tenantName} invited you
        </h1>
        <p className="text-sm text-white/50">
          Create your account to access your personal portal
        </p>
      </div>

      {/* What you'll get */}
      <div className="rounded-2xl bg-white/4 border border-white/8 p-4">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
          Your portal includes
        </p>
        <div className="space-y-2.5">
          {enabledFeatures.map(f => (
            <div key={f.key} className="flex items-center gap-3">
              <f.Icon className={`w-4 h-4 ${f.color} flex-shrink-0`} />
              <span className="text-sm text-white/70">{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Expiry */}
      <p className="text-xs text-white/30 text-center">
        Invite expires {new Date(invite.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
      </p>

      {/* Form error */}
      {formError && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-400/8 border border-red-400/20 p-3.5">
          <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-300">{formError}</p>
        </div>
      )}

      {/* Already logged in — just confirm */}
      {isAlreadyLoggedIn ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-400/8 border border-emerald-400/20 px-4 py-3">
            <p className="text-xs font-medium text-emerald-300">
              Signed in as {currentUserEmail}
            </p>
            <p className="text-xs text-emerald-300/60 mt-0.5">
              Click below to link this account to {invite.tenantName}.
            </p>
          </div>
          <button
            onClick={handleAccept}
            disabled={isSubmitting}
            className="w-full h-12 rounded-xl font-semibold text-sm bg-gold-gradient text-graphite-900 hover:shadow-glow-gold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Linking account…</>
              : <><CheckCircle2 className="w-4 h-4" /> Accept &amp; link account</>
            }
          </button>
        </div>
      ) : (
        /* Password form */
        <div className="space-y-4">
          {/* Email (pre-filled, read-only) */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">Email</label>
            <input
              type="email"
              value={invite.email}
              disabled
              className="w-full h-10 px-3 rounded-xl bg-white/4 border border-white/8 text-sm text-white/50 cursor-not-allowed"
            />
          </div>

          {/* Full name */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Full name <span className="text-white/30">(optional)</span>
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Jane Smith"
              className="w-full h-10 px-3 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Password <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                minLength={6}
                className="w-full h-10 pl-3 pr-10 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
              />
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm password */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Confirm password <span className="text-red-400">*</span>
            </label>
            <input
              type={showPass ? 'text' : 'password'}
              value={confirmPass}
              onChange={e => setConfirmPass(e.target.value)}
              placeholder="Re-enter password"
              minLength={6}
              className="w-full h-10 px-3 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
            />
          </div>

          <button
            onClick={handleAccept}
            disabled={isSubmitting}
            className="w-full h-12 rounded-xl font-semibold text-sm bg-gold-gradient text-graphite-900 hover:shadow-glow-gold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
          >
            {isSubmitting
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
              : <><CheckCircle2 className="w-4 h-4" /> Create account &amp; accept</>
            }
          </button>

          <p className="text-center text-xs text-white/30">
            Already have an account?{' '}
            <a href={`/login?next=/invite/customer?token=${encodeURIComponent(token)}`} className="text-gold-400 hover:text-gold-300">
              Sign in first
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
