// components/domains/DomainCard.tsx
'use client'

import { useState }               from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, Trash2, ChevronDown, ExternalLink, RefreshCw } from 'lucide-react'
import { DomainStatusBadge }        from './DomainStatusBadge'
import { DomainVerificationPanel }  from './DomainVerificationPanel'
import { PrimaryDomainToggle }      from './PrimaryDomainToggle'

export interface DomainEntry {
  id:                  string
  tenant_id:           string
  hostname:            string
  domain_type:         'subdomain' | 'custom'
  is_primary:          boolean
  is_verified:         boolean
  verification_token:  string | null
  verification_method: string | null
  ssl_status:          'pending' | 'active' | 'failed'
  last_verified_at:    string | null
  metadata:            Record<string, unknown>
  created_at:          string
}

interface DomainCardProps {
  domain:    DomainEntry
  onRemove?: (id: string) => void
  onChange?: () => void
  readonly?: boolean
}

export function DomainCard({ domain, onRemove, onChange, readonly = false }: DomainCardProps) {
  const [expanded,     setExpanded]     = useState(!domain.is_verified && domain.domain_type === 'custom')
  const [deleting,     setDeleting]     = useState(false)
  const [checkingSSL,  setCheckingSSL]  = useState(false)
  const [sslStatus,    setSslStatus]    = useState(domain.ssl_status)
  const [isVerified,   setIsVerified]   = useState(domain.is_verified)

  const isSubdomain = domain.domain_type === 'subdomain'

  const handleDelete = async () => {
    if (!confirm(`Remove ${domain.hostname}? This cannot be undone.`)) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/domains/${domain.id}`, { method: 'DELETE' })
      if (res.ok) onRemove?.(domain.id)
    } finally {
      setDeleting(false)
    }
  }

  const handleRefreshSSL = async () => {
    setCheckingSSL(true)
    try {
      const res  = await fetch(`/api/domains/status?domain_id=${domain.id}`)
      const data = await res.json()
      if (data.ssl_status) setSslStatus(data.ssl_status)
    } finally {
      setCheckingSSL(false)
    }
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.97 }}
      className={`rounded-2xl border backdrop-blur-sm transition-colors ${
        isSubdomain
          ? 'border-sky-500/20 bg-zinc-900/50'
          : isVerified
            ? 'border-emerald-500/20 bg-zinc-900/50'
            : 'border-zinc-700/50 bg-zinc-900/40'
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
          isSubdomain ? 'bg-sky-500/15' : 'bg-zinc-800/50'
        }`}>
          <Globe className={`h-4 w-4 ${isSubdomain ? 'text-sky-400' : 'text-zinc-400'}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-zinc-100 truncate">
              {domain.hostname}
            </span>
            <DomainStatusBadge type="domain_type" status={domain.domain_type} />
            {domain.is_primary && <DomainStatusBadge type="primary" status="true" />}
            <DomainStatusBadge
              type="verification"
              status={isVerified ? 'verified' : 'pending'}
            />
            <DomainStatusBadge type="ssl" status={sslStatus} />
          </div>
          {domain.last_verified_at && (
            <p className="mt-0.5 text-xs text-zinc-600">
              Last verified: {new Date(domain.last_verified_at).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Actions */}
        {!readonly && (
          <div className="flex items-center gap-1 flex-shrink-0">
            {!isSubdomain && (
              <PrimaryDomainToggle
                domainId={domain.id}
                isPrimary={domain.is_primary}
                isVerified={isVerified}
                onChange={onChange}
              />
            )}

            {!isSubdomain && isVerified && (
              <button
                onClick={handleRefreshSSL}
                disabled={checkingSSL}
                title="Refresh SSL status"
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-300"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checkingSSL ? 'animate-spin' : ''}`} />
              </button>
            )}

            <a
              href={`https://${domain.hostname}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>

            {!isSubdomain && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}

            {!isSubdomain && !isVerified && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-700/50 hover:text-zinc-300"
              >
                <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                  <ChevronDown className="h-4 w-4" />
                </motion.div>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Expanded verification panel */}
      <AnimatePresence>
        {expanded && !isSubdomain && !isVerified && !readonly && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="border-t border-zinc-800/50 px-4 pb-4 pt-3">
              <DomainVerificationPanel
                domainId={domain.id}
                domain={domain.hostname}
                verificationToken={domain.verification_token}
                isVerified={isVerified}
                onVerified={() => {
                  setIsVerified(true)
                  setExpanded(false)
                  onChange?.()
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
