'use client'
// components/payments/ProviderStatusCard.tsx
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2, XCircle, AlertCircle, ChevronDown,
  ChevronUp, Star, Unplug, KeyRound, Zap,
} from 'lucide-react'

interface Provider {
  id:           string
  provider_key: string
  is_enabled:   boolean
  is_default:   boolean
  created_at:   string
  updated_at?:  string
}

interface Account {
  id:                  string
  provider_key:        string
  provider_account_id: string | null
  status:              string
  connection_method?:  string
  created_at:          string
}

interface Props {
  providers: Provider[]
  accounts:  Account[]
  tenantId:  string
}

const PROVIDER_LABELS: Record<string, { name: string; color: string; desc: string; oauthLabel: string }> = {
  stripe: {
    name:       'Stripe',
    color:      'text-purple-400',
    desc:       'Card payments, subscriptions, hosted checkout',
    oauthLabel: 'Connect with Stripe',
  },
  square: {
    name:       'Square',
    color:      'text-blue-400',
    desc:       'In-person & online payments, POS integration',
    oauthLabel: 'Connect with Square',
  },
}

type ConnectMode = 'oauth' | 'apikey' | null

export function ProviderStatusCard({ providers, accounts, tenantId: _tenantId }: Props) {
  const searchParams = useSearchParams()
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [success,     setSuccess]     = useState<string | null>(null)
  const [showMode,    setShowMode]    = useState<Record<string, ConnectMode>>({})
  const [formData,    setFormData]    = useState({
    secret_key:     '',
    webhook_secret: '',
    account_id:     '',
    is_default:     false,
  })

  // Handle OAuth redirect result
  useEffect(() => {
    const connected = searchParams.get('connected')
    const errParam  = searchParams.get('error')

    if (connected) {
      const name = PROVIDER_LABELS[connected]?.name ?? connected
      setSuccess(`${name} connected via OAuth successfully`)
      // Clean URL without reload
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (errParam) {
      setError(decodeURIComponent(errParam))
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [searchParams])

  const accountMap     = Object.fromEntries(accounts.map((a) => [a.provider_key, a]))
  const allProviders   = ['stripe', 'square'] as const

  function toggleMode(key: string, mode: ConnectMode) {
    setShowMode((prev) => ({ ...prev, [key]: prev[key] === mode ? null : mode }))
    setError(null)
  }

  function handleOAuthConnect(providerKey: string) {
    // Navigate to our connect endpoint — it generates state + redirects to provider
    window.location.href = `/api/payments/oauth/${providerKey}/connect`
  }

  async function handleApiKeyConnect(providerKey: 'stripe' | 'square') {
    if (!formData.secret_key.trim()) {
      setError('Secret key is required')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/payments/providers', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider_key:   providerKey,
          secret_key:     formData.secret_key.trim(),
          webhook_secret: formData.webhook_secret.trim() || undefined,
          account_id:     formData.account_id.trim()    || undefined,
          is_default:     formData.is_default,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setSuccess(`${PROVIDER_LABELS[providerKey].name} connected via API key`)
      setShowMode((prev) => ({ ...prev, [providerKey]: null }))
      setFormData({ secret_key: '', webhook_secret: '', account_id: '', is_default: false })
      setTimeout(() => location.reload(), 1200)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSetDefault(providerId: string) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/payments/providers/${providerId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setSuccess('Default provider updated')
      setTimeout(() => location.reload(), 1000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDisconnect(providerKey: string) {
    const name = PROVIDER_LABELS[providerKey]?.name ?? providerKey
    if (!confirm(`Disconnect ${name}? Existing transactions will not be affected.`)) return

    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/payments/providers/disconnect', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider_key: providerKey }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setSuccess(`${name} disconnected`)
      setTimeout(() => location.reload(), 1000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Payment Providers</h1>
        <p className="text-sm text-white/40 mt-1">
          Connect Stripe and Square via OAuth or API keys to accept payments
        </p>
      </div>

      <AnimatePresence mode="popLayout">
        {error && (
          <motion.div
            key="err"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-sm text-red-400"
          >
            {error}
          </motion.div>
        )}
        {success && (
          <motion.div
            key="ok"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-xl bg-emerald-400/8 border border-emerald-400/20 text-sm text-emerald-400"
          >
            {success}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {allProviders.map((key) => {
          const meta       = PROVIDER_LABELS[key]
          const connected  = providers.find((p) => p.provider_key === key)
          const account    = accountMap[key]
          const isOAuth    = account?.connection_method === 'oauth'
          const mode       = showMode[key] ?? null

          return (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="premium-panel premium-border rounded-2xl p-5"
            >
              {/* Provider header row */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-xl bg-white/6 border border-white/10 flex items-center justify-center flex-shrink-0">
                    {connected?.is_enabled ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-white/20" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-semibold ${meta.color}`}>{meta.name}</h3>

                      {connected?.is_default && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gold-400/10 text-gold-400 border border-gold-400/20">
                          Default
                        </span>
                      )}

                      {connected?.is_enabled && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 border border-emerald-400/20">
                          Connected
                        </span>
                      )}

                      {connected?.is_enabled && (
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${isOAuth ? 'bg-purple-400/10 text-purple-400 border-purple-400/20' : 'bg-white/5 text-white/40 border-white/10'}`}>
                          {isOAuth ? 'OAuth' : 'API Key'}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-white/40 mt-0.5">{meta.desc}</p>

                    {account?.provider_account_id && (
                      <p className="text-xs text-white/30 mt-1 font-mono">
                        ID: {account.provider_account_id}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                  {connected && !connected.is_default && (
                    <button
                      onClick={() => handleSetDefault(connected.id)}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs text-gold-400 border border-gold-400/30 rounded-lg px-2.5 py-1.5 hover:bg-gold-400/8 transition-colors disabled:opacity-50"
                    >
                      <Star className="h-3 w-3" />
                      Set default
                    </button>
                  )}

                  {connected ? (
                    <button
                      onClick={() => handleDisconnect(key)}
                      disabled={loading}
                      className="flex items-center gap-1.5 text-xs text-red-400/70 border border-red-400/20 rounded-lg px-2.5 py-1.5 hover:bg-red-400/6 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <Unplug className="h-3 w-3" />
                      Disconnect
                    </button>
                  ) : (
                    <>
                      {/* OAuth connect */}
                      <button
                        onClick={() => handleOAuthConnect(key)}
                        disabled={loading}
                        className="flex items-center gap-1.5 text-xs font-semibold text-white border border-white/20 rounded-lg px-3 py-1.5 hover:bg-white/8 hover:border-white/30 transition-colors disabled:opacity-50"
                      >
                        <Zap className="h-3.5 w-3.5 text-gold-400" />
                        {meta.oauthLabel}
                      </button>

                      {/* API key toggle */}
                      <button
                        onClick={() => toggleMode(key, 'apikey')}
                        className="flex items-center gap-1.5 text-xs text-white/50 border border-white/10 rounded-lg px-2.5 py-1.5 hover:bg-white/5 hover:text-white/70 transition-colors"
                      >
                        <KeyRound className="h-3 w-3" />
                        API Key
                        {mode === 'apikey' ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* API Key fallback form */}
              <AnimatePresence>
                {mode === 'apikey' && !connected && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 pt-4 border-t border-white/6 space-y-3">
                      <p className="text-xs text-white/40 flex items-center gap-1.5">
                        <KeyRound className="h-3 w-3 text-white/30" />
                        Manual API key connection — OAuth is recommended for security
                      </p>

                      <div>
                        <label className="block text-xs font-medium text-white/60 mb-1.5">
                          {key === 'stripe' ? 'Secret Key (sk_live_... or sk_test_...)' : 'Access Token'}
                          <span className="text-red-400 ml-0.5">*</span>
                        </label>
                        <input
                          type="password"
                          value={formData.secret_key}
                          onChange={(e) => setFormData({ ...formData, secret_key: e.target.value })}
                          placeholder={key === 'stripe' ? 'sk_live_...' : 'EAAAl...'}
                          className="store-input w-full text-sm"
                          autoComplete="off"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-white/60 mb-1.5">
                          Webhook Secret (optional)
                        </label>
                        <input
                          type="password"
                          value={formData.webhook_secret}
                          onChange={(e) => setFormData({ ...formData, webhook_secret: e.target.value })}
                          placeholder={key === 'stripe' ? 'whsec_...' : 'Webhook signature key'}
                          className="store-input w-full text-sm"
                          autoComplete="off"
                        />
                      </div>

                      {key === 'square' && (
                        <div>
                          <label className="block text-xs font-medium text-white/60 mb-1.5">
                            Location ID
                          </label>
                          <input
                            type="text"
                            value={formData.account_id}
                            onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
                            placeholder="L..."
                            className="store-input w-full text-sm"
                          />
                        </div>
                      )}

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.is_default}
                          onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                          className="rounded border-white/20 bg-white/5 text-gold-500 focus:ring-gold-500/30"
                        />
                        <span className="text-xs text-white/60">Set as default provider</span>
                      </label>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleApiKeyConnect(key)}
                          disabled={loading || !formData.secret_key.trim()}
                          className="flex-1 h-9 rounded-xl bg-gold-gradient text-graphite-900 text-sm font-semibold hover:shadow-glow-gold transition-shadow disabled:opacity-50"
                        >
                          {loading ? 'Connecting…' : `Connect ${meta.name}`}
                        </button>
                        <button
                          onClick={() => toggleMode(key, null)}
                          className="px-4 h-9 rounded-xl text-sm text-white/40 hover:text-white border border-white/10 hover:border-white/20 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>

      {/* Info box */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-white/3 border border-white/8">
        <AlertCircle className="h-4 w-4 text-white/30 flex-shrink-0 mt-0.5" />
        <div className="space-y-1.5 text-xs text-white/40 leading-relaxed">
          <p>
            <span className="text-white/60 font-medium">OAuth (recommended)</span> — Click &quot;Connect with Stripe/Square&quot; to authorize via your provider account. Tokens are stored server-side and never exposed to the browser.
          </p>
          <p>
            <span className="text-white/60 font-medium">API Key</span> — Enter your secret key manually. Webhook secrets are used to verify incoming events. Configure your webhook endpoint to{' '}
            <span className="font-mono text-white/60">/api/payments/webhooks/{'{provider}'}</span>.
          </p>
        </div>
      </div>
    </div>
  )
}
