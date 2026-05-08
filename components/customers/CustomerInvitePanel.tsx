'use client'
// components/customers/CustomerInvitePanel.tsx
// Shows invite status on the customer detail page with action buttons.

import { useState, useCallback, useEffect } from 'react'
import { Mail, RefreshCw, XCircle, Copy, CheckCheck, Clock, CheckCircle2, AlertCircle } from 'lucide-react'
import { InviteCustomerModal } from './InviteCustomerModal'

interface CustomerInvite {
  id:           string
  email:        string
  status:       'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at:   string
  accepted_at:  string | null
  resend_count: number
  last_sent_at: string | null
  invite_url:   string | null
}

interface Props {
  customerId:    string
  customerEmail: string | null
  customerName:  string
  customerPhone: string | null
  hasAccount:    boolean
  tenantId:      string
}

const STATUS_CONFIG = {
  pending:  { label: 'Invite pending',   color: 'text-amber-400',   bg: 'bg-amber-400/10',   border: 'border-amber-400/20',   Icon: Clock         },
  accepted: { label: 'Account active',   color: 'text-emerald-400', bg: 'bg-emerald-400/10', border: 'border-emerald-400/20', Icon: CheckCircle2  },
  expired:  { label: 'Invite expired',   color: 'text-white/40',    bg: 'bg-white/4',         border: 'border-white/8',         Icon: AlertCircle   },
  revoked:  { label: 'Invite revoked',   color: 'text-red-400',     bg: 'bg-red-400/10',      border: 'border-red-400/20',      Icon: XCircle       },
}

export function CustomerInvitePanel({
  customerId,
  customerEmail,
  customerName,
  customerPhone,
  hasAccount,
  tenantId,
}: Props) {
  const [invite,      setInvite]      = useState<CustomerInvite | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [showModal,   setShowModal]   = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [error,       setError]       = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)

  const loadInvite = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/customers/invites?customerId=${customerId}`)
      const data = await res.json()
      if (data.ok && data.invites?.length > 0) {
        // Use the most recent non-revoked invite, or the most recent one if all revoked
        const sorted = (data.invites as CustomerInvite[]).sort(
          (a, b) => new Date(b.last_sent_at ?? b.expires_at).getTime() - new Date(a.last_sent_at ?? a.expires_at).getTime()
        )
        const active = sorted.find(i => i.status !== 'revoked') ?? sorted[0]
        setInvite(active)
      } else {
        setInvite(null)
      }
    } catch {
      setInvite(null)
    } finally {
      setLoading(false)
    }
  }, [customerId])

  useEffect(() => { loadInvite() }, [loadInvite])

  const handleResend = useCallback(async () => {
    if (!invite) return
    setActionLoading('resend')
    setError(null)
    try {
      const res  = await fetch(`/api/customers/invites/${invite.id}/resend`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) { setError(data.error ?? 'Resend failed.'); return }
      await loadInvite()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }, [invite, loadInvite])

  const handleRevoke = useCallback(async () => {
    if (!invite) return
    if (!confirm('Revoke this invite? The customer will no longer be able to use the invite link.')) return
    setActionLoading('revoke')
    setError(null)
    try {
      const res  = await fetch(`/api/customers/invites/${invite.id}/revoke`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) { setError(data.error ?? 'Revoke failed.'); return }
      await loadInvite()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setActionLoading(null)
    }
  }, [invite, loadInvite])

  const copyLink = useCallback(() => {
    const url = invite?.invite_url
    if (!url) return
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [invite])

  if (loading) {
    return (
      <div className="premium-panel premium-border rounded-2xl p-5 animate-pulse">
        <div className="h-4 w-32 bg-white/8 rounded mb-3" />
        <div className="h-8 w-full bg-white/4 rounded-xl" />
      </div>
    )
  }

  const cfg = invite ? STATUS_CONFIG[invite.status] ?? STATUS_CONFIG.pending : null

  return (
    <>
      <div className="premium-panel premium-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Customer Portal Access</h2>
        </div>

        {/* Status badge */}
        {invite && cfg ? (
          <div className={`flex items-center gap-2.5 rounded-xl ${cfg.bg} border ${cfg.border} px-4 py-3`}>
            <cfg.Icon className={`w-4 h-4 ${cfg.color} flex-shrink-0`} />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</p>
              {invite.status === 'pending' && (
                <p className="text-xs text-white/30 mt-0.5">
                  Expires {new Date(invite.expires_at).toLocaleDateString()}
                  {invite.resend_count > 0 && ` · Sent ${invite.resend_count + 1}×`}
                </p>
              )}
              {invite.status === 'accepted' && invite.accepted_at && (
                <p className="text-xs text-white/30 mt-0.5">
                  Accepted {new Date(invite.accepted_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 rounded-xl bg-white/4 border border-white/8 px-4 py-3">
            <Mail className="w-4 h-4 text-white/30 flex-shrink-0" />
            <p className="text-xs text-white/40">
              {hasAccount ? 'Account linked without invite.' : 'No portal access. Send an invite to get started.'}
            </p>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-xs text-red-400 bg-red-400/8 border border-red-400/20 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {/* Send invite — shown when no active invite or invite is expired/revoked */}
          {(!invite || invite.status === 'expired' || invite.status === 'revoked') && !hasAccount && customerEmail && (
            <button
              onClick={() => setShowModal(true)}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold transition-all"
            >
              <Mail className="w-3.5 h-3.5" />
              Send invite
            </button>
          )}

          {/* Resend — pending or expired */}
          {invite && (invite.status === 'pending' || invite.status === 'expired') && (
            <button
              onClick={handleResend}
              disabled={actionLoading === 'resend'}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:bg-white/8 disabled:opacity-50 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === 'resend' ? 'animate-spin' : ''}`} />
              Resend
            </button>
          )}

          {/* Copy link — pending or expired (before revoke) */}
          {invite && invite.status === 'pending' && invite.invite_url && (
            <button
              onClick={copyLink}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold border border-white/10 text-white/60 hover:text-white hover:bg-white/8 transition-all"
            >
              {copied
                ? <><CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Copied!</>
                : <><Copy className="w-3.5 h-3.5" /> Copy link</>
              }
            </button>
          )}

          {/* Revoke — pending only */}
          {invite && invite.status === 'pending' && (
            <button
              onClick={handleRevoke}
              disabled={actionLoading === 'revoke'}
              className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-xl text-xs font-semibold border border-red-400/20 text-red-400/80 hover:text-red-400 hover:bg-red-400/8 disabled:opacity-50 transition-all"
            >
              <XCircle className={`w-3.5 h-3.5 ${actionLoading === 'revoke' ? 'animate-spin' : ''}`} />
              Revoke
            </button>
          )}

          {/* Send invite if no email on customer */}
          {!customerEmail && !hasAccount && (
            <p className="text-xs text-white/30 py-1.5">
              Add an email address to this customer to send an invite.
            </p>
          )}
        </div>
      </div>

      {showModal && (
        <InviteCustomerModal
          tenantId={tenantId}
          customerId={customerId}
          customerEmail={customerEmail ?? ''}
          customerName={customerName}
          customerPhone={customerPhone ?? ''}
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false)
            loadInvite()
          }}
        />
      )}
    </>
  )
}
