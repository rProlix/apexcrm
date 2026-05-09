'use client'
// components/owner/CreateBusinessUserModal.tsx
// Modal form for the platform owner to create a new business user account.

import { useState, useCallback, useRef, useEffect } from 'react'
import {
  X, User, Mail, Lock, Shield, CheckCheck,
  Copy, ExternalLink, Eye, EyeOff, AlertCircle, Loader2,
} from 'lucide-react'
import type { BusinessRole } from '@/lib/types/businessUsers'
import { ROLE_LABELS } from '@/lib/types/businessUsers'

interface Props {
  tenantId:   string
  tenantName: string
  onClose:    () => void
  onCreated?: (user: CreatedUser) => void
}

interface CreatedUser {
  id:        string
  authUserId: string
  email:     string
  fullName:  string | null
  role:      BusinessRole
  status:    string
  approved:  boolean
  loginUrl:  string
  password:  string
}

const ROLES: BusinessRole[] = ['admin', 'manager', 'staff']

export function CreateBusinessUserModal({ tenantId, tenantName, onClose, onCreated }: Props) {
  const [fullName,     setFullName]     = useState('')
  const [email,        setEmail]        = useState('')
  const [role,         setRole]         = useState<BusinessRole>('staff')
  const [password,     setPassword]     = useState('')
  const [confirmPass,  setConfirmPass]  = useState('')
  const [showPass,     setShowPass]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState<string | null>(null)
  const [created,      setCreated]      = useState<CreatedUser | null>(null)
  const [copied,       setCopied]       = useState(false)

  const firstInputRef = useRef<HTMLInputElement>(null)
  useEffect(() => { firstInputRef.current?.focus() }, [])

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!fullName.trim()) { setError('Full name is required.'); return }
    if (!email.trim())    { setError('Email is required.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirmPass) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      const res  = await fetch('/api/owner/business-users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          tenantId,
          email:    email.trim().toLowerCase(),
          fullName: fullName.trim(),
          role,
          password,
          approved: true,
          status:   'active',
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(data.error ?? 'Failed to create account. Please try again.')
        return
      }
      const newUser: CreatedUser = {
        ...data.user,
        loginUrl: data.loginUrl,
        password, // display once, only stored in client state
      }
      setCreated(newUser)
      onCreated?.(newUser)
    } catch {
      setError('Network error. Please check your connection.')
    } finally {
      setLoading(false)
    }
  }, [fullName, email, role, password, confirmPass, tenantId, onCreated])

  const handleCopy = useCallback(() => {
    if (!created) return
    const text = [
      `Business: ${tenantName}`,
      `Login URL: ${created.loginUrl}`,
      `Email: ${created.email}`,
      `Password: ${created.password}`,
      `Role: ${ROLE_LABELS[created.role]}`,
    ].join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [created, tenantName])

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={handleBackdrop}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full sm:max-w-md bg-graphite-900 border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-gold-gradient flex items-center justify-center">
              <Shield className="w-4 h-4 text-graphite-900" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Create Business Account</h2>
              <p className="text-xs text-white/40 truncate max-w-[200px]">{tenantName}</p>
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

        <div className="px-6 py-5 max-h-[80vh] overflow-y-auto">
          {/* ── Success state ── */}
          {created ? (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center py-2">
                <div className="h-14 w-14 rounded-2xl bg-emerald-400/10 border border-emerald-400/20 flex items-center justify-center mb-4">
                  <CheckCheck className="w-7 h-7 text-emerald-400" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1">Account created!</h3>
                <p className="text-sm text-white/50">
                  {created.fullName ?? created.email} can now log into the CRM.
                </p>
              </div>

              {/* Credentials card */}
              <div className="rounded-xl bg-white/4 border border-white/8 p-4 space-y-3">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wider">Login credentials</p>
                <div className="space-y-2 text-sm">
                  {[
                    { label: 'Login URL', value: created.loginUrl },
                    { label: 'Email',     value: created.email },
                    { label: 'Password',  value: created.password },
                    { label: 'Role',      value: ROLE_LABELS[created.role] },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between gap-3">
                      <span className="text-xs text-white/40 w-20 shrink-0">{label}</span>
                      <span className="text-xs text-white/80 font-mono truncate flex-1">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-amber-400/8 border border-amber-400/20 p-3">
                <p className="text-xs text-amber-300">
                  Save the password now — it will not be shown again.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-xs font-semibold border border-white/10 text-white/70 hover:text-white hover:bg-white/8 transition-colors"
                >
                  {copied
                    ? <><CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Copied!</>
                    : <><Copy className="w-3.5 h-3.5" /> Copy credentials</>
                  }
                </button>
                <a
                  href={created.loginUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl text-xs font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold transition-all"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open login
                </a>
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
                  <AlertCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-300">{error}</p>
                </div>
              )}

              {/* Full name */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  Full name <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    ref={firstInputRef}
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    required
                    placeholder="Jane Smith"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  Email address <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder="person@company.com"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
                  />
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {ROLES.map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRole(r)}
                      className={`h-9 rounded-xl text-xs font-semibold border transition-all ${
                        role === r
                          ? 'bg-gold-500/15 border-gold-500/40 text-gold-300'
                          : 'bg-white/4 border-white/8 text-white/50 hover:text-white hover:bg-white/8'
                      }`}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-white/30 mt-1.5">
                  {role === 'admin'   && 'Full access to settings, staff, and all modules.'}
                  {role === 'manager' && 'Can manage customers, reports, and modules. No settings access.'}
                  {role === 'staff'   && 'View customers and use modules. Read-only access.'}
                </p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1.5">
                  Initial password <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="Min. 8 characters"
                    className="w-full h-10 pl-9 pr-10 rounded-xl bg-white/4 border border-white/10 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"
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
                  required
                  minLength={8}
                  placeholder="Re-enter password"
                  className={`w-full h-10 px-3 rounded-xl bg-white/4 border text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-gold-500/50 ${
                    confirmPass && confirmPass !== password
                      ? 'border-red-400/40 bg-red-400/4'
                      : 'border-white/10'
                  }`}
                />
                {confirmPass && confirmPass !== password && (
                  <p className="text-xs text-red-400 mt-1">Passwords do not match</p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl text-sm font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
                  : <><Shield className="w-4 h-4" /> Create business account</>
                }
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
