'use client'
// components/customers/InviteCustomerModal.tsx
// Modal for sending a customer portal invite from the CRM.

import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Mail, User, Phone, Clock, Send, Copy, CheckCheck, AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  tenantId:    string
  customerId?: string
  customerEmail?: string
  customerName?:  string
  customerPhone?: string
  onClose:     () => void
  onSuccess?:  (invite: InviteResult) => void
}

interface InviteResult {
  id:        string
  email:     string
  status:    string
  expiresAt: string
  inviteUrl: string
}

const EXPIRY_OPTIONS = [
  { label: '1 day',   value: 1  },
  { label: '3 days',  value: 3  },
  { label: '7 days',  value: 7  },
  { label: '14 days', value: 14 },
]

export function InviteCustomerModal({
  tenantId: _tenantId,
  customerId,
  customerEmail = '',
  customerName  = '',
  customerPhone = '',
  onClose,
  onSuccess,
}: Props) {
  const [email,     setEmail]     = useState(customerEmail)
  const [fullName,  setFullName]  = useState(customerName)
  const [phone,     setPhone]     = useState(customerPhone)
  const [expiresIn, setExpiresIn] = useState(7)
  const [sendEmail, setSendEmail] = useState(true)

  const [loading,      setLoading]      = useState(false)
  const [result,       setResult]       = useState<InviteResult | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [emailSent,    setEmailSent]    = useState<boolean | null>(null)
  const [emailError,   setEmailError]   = useState<string | null>(null)
  const [retrying,     setRetrying]     = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) { setError('Email is required.'); return }
    setLoading(true)
    setError(null)

    try {
      const res  = await fetch('/api/customers/invites', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          email:          email.trim(),
          fullName:       fullName.trim() || undefined,
          phone:          phone.trim() || undefined,
          customerId:     customerId || undefined,
          expiresInDays:  expiresIn,
          sendEmail,
        }),
      })

      const data = await res.json()

      if (!data.ok) {
        setError(data.error ?? 'Failed to send invite. Please try again.')
        return
      }

      setResult(data.invite)
      setEmailSent(data.emailSent)
      setEmailError(data.emailError ?? null)
      onSuccess?.(data.invite)
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }, [email, fullName, phone, customerId, expiresIn, sendEmail, onSuccess])

  const copyLink = useCallback(() => {
    if (!result?.inviteUrl) return
    navigator.clipboard.writeText(result.inviteUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [result])

  // Retry sending the email for an already-created invite
  const handleRetryEmail = useCallback(async () => {
    if (!result?.id) return
    setRetrying(true)
    setEmailError(null)
    try {
      const res  = await fetch(`/api/customers/invites/${result.id}/resend`, { method: 'POST' })
      const data = await res.json()
      if (data.ok && data.emailSent) {
        setEmailSent(true)
        setEmailError(null)
      } else {
        setEmailError(data.emailError ?? 'Retry failed. Check your email provider configuration.')
      }
    } catch {
      setEmailError('Network error while retrying. Please try again.')
    } finally {
      setRetrying(false)
    }
  }, [result])

  // Trap focus on modal
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Invite customer"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full sm:max-w-md bg-graphite-900 border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gold-gradient flex items-center justify-center">
              <Mail className="w-4 h-4 text-graphite-900" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Invite Customer</h2>
              <p className="text-xs text-white/40">Send a portal access link</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white/40 hover:text-white hover:bg-white/8 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          {/* ── Success state ── */}
          {result ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center py-2">
                <div className="h-14 w-14 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mb-4">
                  <CheckCheck className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">Invite created!</h3>
                <p className="text-sm text-white/50">
                  {emailSent
                    ? `An invite email was sent to ${result.email}.`
                    : `Invite created for ${result.email}.`}
                </p>
              </div>

              {emailError && !emailSent && (
                <div className="rounded-xl bg-amber-400/8 border border-amber-400/20 p-3.5 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-amber-300">Email not sent</p>
                      <p className="text-xs text-amber-300/80 mt-0.5 leading-relaxed break-words">
                        {emailError}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRetryEmail}
                    disabled={retrying}
                    className="w-full flex items-center justify-center gap-2 h-8 rounded-lg text-xs font-semibold bg-amber-400/15 border border-amber-400/25 text-amber-300 hover:bg-amber-400/20 disabled:opacity-50 transition-colors"
                  >
                    {retrying
                      ? <><RefreshCw className="w-3 h-3 animate-spin" /> Retrying…</>
                      : <><RefreshCw className="w-3 h-3" /> Retry sending email</>
                    }
                  </button>
                </div>
              )}

              {emailSent && (
                <div className="flex items-center gap-2 rounded-xl bg-emerald-400/8 border border-emerald-400/20 px-3.5 py-2.5">
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <p className="text-xs text-emerald-300">Email sent successfully</p>
                </div>
              )}

              <div className="rounded-xl bg-white/4 border border-white/8 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white/50">Invite link</span>
                  <span className="text-xs text-white/30">
                    Expires {new Date(result.expiresAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-xs text-white/70 break-all font-mono leading-relaxed">
                  {result.inviteUrl}
                </p>
                <button
                  onClick={copyLink}
                  className="w-full flex items-center justify-center gap-2 h-9 rounded-xl text-xs font-semibold border border-white/10 text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                >
                  {copied
                    ? <><CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Copied!</>
                    : <><Copy className="w-3.5 h-3.5" /> Copy invite link</>
                  }
                </button>
              </div>

              <button
                onClick={onClose}
                className="w-full h-10 rounded-xl text-sm font-semibold bg-white/8 text-white/70 hover:bg-white/12 hover:text-white transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            /* ── Form state ── */
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2.5 rounded-xl bg-red-400/8 border border-red-400/20 p-3.5">
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5" htmlFor="invite-email">
                  Email address <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    id="invite-email"
                    ref={inputRef}
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    disabled={!!customerEmail}
                    placeholder="customer@example.com"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50 disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Full name */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5" htmlFor="invite-name">
                  Full name <span className="text-white/30">(optional)</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    id="invite-name"
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5" htmlFor="invite-phone">
                  Phone <span className="text-white/30">(optional)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    id="invite-phone"
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
                  />
                </div>
              </div>

              {/* Expiry */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  <Clock className="inline w-3 h-3 mr-1" />
                  Link expires in
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {EXPIRY_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setExpiresIn(opt.value)}
                      className={`h-9 rounded-xl text-xs font-semibold border transition-all ${
                        expiresIn === opt.value
                          ? 'bg-gold-500/15 border-gold-500/40 text-gold-300'
                          : 'bg-white/4 border-white/8 text-white/50 hover:text-white hover:bg-white/8'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Send email toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`relative h-5 w-9 rounded-full transition-colors ${sendEmail ? 'bg-gold-500' : 'bg-white/10'}`}
                  onClick={() => setSendEmail(v => !v)}
                  role="checkbox"
                  aria-checked={sendEmail}
                  tabIndex={0}
                  onKeyDown={e => e.key === ' ' && setSendEmail(v => !v)}
                >
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${sendEmail ? 'left-4' : 'left-0.5'}`} />
                </div>
                <span className="text-xs text-white/60">Send invite email</span>
              </label>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl text-sm font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="h-4 w-4 rounded-full border-2 border-graphite-900/30 border-t-graphite-900 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send Invite
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
