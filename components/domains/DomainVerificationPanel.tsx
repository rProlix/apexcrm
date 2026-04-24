// components/domains/DomainVerificationPanel.tsx
'use client'

import { useState }               from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Loader2, AlertCircle, RefreshCw } from 'lucide-react'
import { DomainDnsInstructions }   from './DomainDnsInstructions'

interface DomainVerificationPanelProps {
  domainId:           string
  domain:             string
  verificationToken?: string | null
  isVerified:         boolean
  onVerified?:        () => void
}

interface VerifyResult {
  ok:       boolean
  verified: boolean
  message:  string
  hint?:    string
}

export function DomainVerificationPanel({
  domainId,
  domain,
  verificationToken,
  isVerified,
  onVerified,
}: DomainVerificationPanelProps) {
  const [loading,  setLoading]  = useState(false)
  const [result,   setResult]   = useState<VerifyResult | null>(null)
  const [attempts, setAttempts] = useState(0)

  const verify = async () => {
    setLoading(true)
    setResult(null)

    try {
      const res = await fetch('/api/domains/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ domain_id: domainId }),
      })
      const data: VerifyResult = await res.json()
      setResult(data)
      setAttempts((n) => n + 1)
      if (data.verified) onVerified?.()
    } catch {
      setResult({ ok: false, verified: false, message: 'Network error. Please try again.' })
    } finally {
      setLoading(false)
    }
  }

  if (isVerified) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3"
      >
        <CheckCircle className="h-4 w-4 text-emerald-400" />
        <span className="text-sm text-emerald-300">Domain verified and active</span>
      </motion.div>
    )
  }

  return (
    <div className="space-y-3">
      {verificationToken && (
        <DomainDnsInstructions
          domain={domain}
          verificationToken={verificationToken}
          expanded={attempts === 0}
        />
      )}

      <motion.button
        type="button"
        onClick={verify}
        disabled={loading}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#c9a84c]/30 bg-[#c9a84c]/10 py-3 text-sm font-semibold text-[#c9a84c] transition-all hover:bg-[#c9a84c]/20 disabled:opacity-60"
      >
        {loading
          ? <Loader2  className="h-4 w-4 animate-spin" />
          : <RefreshCw className="h-4 w-4" />
        }
        {loading ? 'Checking DNS…' : attempts > 0 ? 'Check Again' : 'Verify Domain'}
      </motion.button>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
              result.verified
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/30 bg-red-500/10 text-red-300'
            }`}
          >
            {result.verified
              ? <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-400" />
              : <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-400"     />
            }
            <div>
              <p>{result.message}</p>
              {result.hint && (
                <p className="mt-1 font-mono text-xs opacity-70">{result.hint}</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
