'use client'
// components/customers/CustomerLinkModal.tsx
import { useState, useTransition } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Link2, Unlink, Loader2, CheckCircle2 } from 'lucide-react'

interface Props {
  customerId:    string
  customerName:  string
  hasAccount:    boolean
  accountId?:    string
  tenantId:      string
  onClose:       () => void
  onSuccess?:    () => void
}

export function CustomerLinkModal({
  customerId, customerName, hasAccount, accountId, tenantId, onClose, onSuccess
}: Props) {
  const [email, setEmail]          = useState('')
  const [name, setName]            = useState(customerName)
  const [isPending, startTransition] = useTransition()
  const [success, setSuccess]      = useState(false)
  const [error, setError]          = useState<string | null>(null)

  const handleUnlink = () => {
    if (!accountId) return
    startTransition(async () => {
      setError(null)
      try {
        const res = await fetch('/api/customers/link', {
          method:  'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ account_id: accountId, tenant_id: tenantId }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Unlink failed')
        setSuccess(true)
        setTimeout(() => { onSuccess?.(); onClose() }, 1200)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    })
  }

  const handleInvite = () => {
    if (!email.trim()) return
    startTransition(async () => {
      setError(null)
      try {
        const res = await fetch('/api/customers/link', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ customer_id: customerId, email: email.trim(), name, tenant_id: tenantId }),
        })
        if (!res.ok) throw new Error((await res.json()).error ?? 'Link failed')
        setSuccess(true)
        setTimeout(() => { onSuccess?.(); onClose() }, 1200)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    })
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-graphite-950/80 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          className="relative premium-panel premium-border rounded-2xl w-full max-w-md p-6 z-10"
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white/30 hover:text-white/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="h-9 w-9 rounded-xl bg-gold-gradient flex items-center justify-center shadow-glow-gold">
              <Link2 className="w-4 h-4 text-graphite-900" />
            </div>
            <div>
              <h2 className="font-semibold text-white text-base">
                {hasAccount ? 'Manage Account Link' : 'Link Portal Account'}
              </h2>
              <p className="text-xs text-white/40">{customerName}</p>
            </div>
          </div>

          {success ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              <p className="text-sm text-emerald-400 font-medium">Done!</p>
            </div>
          ) : hasAccount ? (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                This customer has a linked portal account. You can remove their access below.
              </p>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="button"
                onClick={handleUnlink}
                disabled={isPending}
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border border-red-500/30 text-red-400 hover:bg-red-500/8 disabled:opacity-50 transition-all"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
                Remove portal access
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-white/60">
                Enter the email address to search for or invite to the portal.
              </p>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="customer@example.com"
                className="w-full h-10 px-4 rounded-xl bg-graphite-900 border border-white/8 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
              />
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Full name (optional)"
                className="w-full h-10 px-4 rounded-xl bg-graphite-900 border border-white/8 text-white placeholder:text-white/25 text-sm focus:outline-none focus:border-gold-500/40 transition-colors"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                type="button"
                onClick={handleInvite}
                disabled={isPending || !email.trim()}
                className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold bg-gold-gradient text-graphite-900 hover:shadow-glow-gold disabled:opacity-50 transition-all"
              >
                {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                Link account
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
