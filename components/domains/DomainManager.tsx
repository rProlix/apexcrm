// components/domains/DomainManager.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence }           from 'framer-motion'
import { Globe, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { DomainCard }        from './DomainCard'
import { DomainInput }       from './DomainInput'
import { SubdomainDisplay }  from './SubdomainDisplay'
import { DomainPreviewCard } from './DomainPreviewCard'
import type { DomainEntry }  from './DomainCard'

interface DomainManagerProps {
  tenantId:   string
  slug:       string
  userRole:   'owner' | 'admin'
  showVercel?: boolean
}

export function DomainManager({
  tenantId,
  slug,
  userRole,
  showVercel = false,
}: DomainManagerProps) {
  const [domains,   setDomains]   = useState<DomainEntry[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState<string | null>(null)
  const [newDomain, setNewDomain] = useState('')
  const [adding,    setAdding]    = useState(false)
  const [addError,  setAddError]  = useState<string | null>(null)
  const [syncing,   setSyncing]   = useState(false)

  const fetchDomains = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const qs  = userRole === 'owner' ? `?tenant_id=${tenantId}` : ''
      const res = await fetch(`/api/domains${qs}`)
      const data: { domains?: DomainEntry[]; error?: string } = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to load domains')
      setDomains(data.domains ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load domains')
    } finally {
      setLoading(false)
    }
  }, [tenantId, userRole])

  useEffect(() => { fetchDomains() }, [fetchDomains])

  const addDomain = async () => {
    setAdding(true)
    setAddError(null)
    try {
      const res  = await fetch('/api/domains', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain: newDomain, tenant_id: tenantId }),
      })
      const data = await res.json()
      if (!res.ok) { setAddError(data.error ?? 'Failed to add domain'); return }
      setNewDomain('')
      await fetchDomains()
    } catch {
      setAddError('Network error. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  const syncVercel = async () => {
    setSyncing(true)
    try {
      await fetch('/api/domains/sync-vercel', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenant_id: tenantId }),
      })
      await fetchDomains()
    } finally {
      setSyncing(false)
    }
  }

  const customDomains   = domains.filter((d) => d.domain_type === 'custom')
  const verifiedCustom  = customDomains.find((d) => d.is_verified)

  return (
    <div className="space-y-6">
      {/* Free subdomain */}
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-zinc-500">
          Platform Subdomain
        </h3>
        <SubdomainDisplay slug={slug} />
      </div>

      {/* Live preview */}
      <DomainPreviewCard
        slug={slug}
        customDomain={verifiedCustom?.hostname ?? null}
        isVerified={!!verifiedCustom}
      />

      {/* Custom domains */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-500">
            Custom Domains
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDomains}
              disabled={loading}
              className="rounded-lg p-1.5 text-zinc-600 transition-colors hover:bg-zinc-800/50 hover:text-zinc-400"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {showVercel && userRole === 'owner' && (
              <motion.button
                onClick={syncVercel}
                disabled={syncing}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-800/30 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800/60"
              >
                {syncing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Globe className="h-3 w-3" />}
                Sync Vercel
              </motion.button>
            )}
          </div>
        </div>

        {/* Add domain form */}
        <div className="mb-4">
          <DomainInput
            value={newDomain}
            onChange={setNewDomain}
            onAdd={addDomain}
            loading={adding}
            error={addError}
            disabled={loading}
          />
        </div>

        {/* Domain list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-600" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {customDomains.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="rounded-xl border border-dashed border-zinc-700/50 px-4 py-8 text-center"
              >
                <Globe className="mx-auto mb-2 h-6 w-6 text-zinc-700" />
                <p className="text-sm text-zinc-600">No custom domains yet</p>
                <p className="mt-1 text-xs text-zinc-700">Add your domain above to get started</p>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {customDomains.map((d) => (
                  <DomainCard
                    key={d.id}
                    domain={d}
                    onRemove={() => fetchDomains()}
                    onChange={() => fetchDomains()}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
