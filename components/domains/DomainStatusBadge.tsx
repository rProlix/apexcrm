// components/domains/DomainStatusBadge.tsx
'use client'

import { motion } from 'framer-motion'
import { CheckCircle, Clock, XCircle, Shield, Globe } from 'lucide-react'

type VerificationStatus = 'verified' | 'pending' | 'failed' | 'unverified'
type SslStatus          = 'active' | 'pending' | 'failed'

interface DomainStatusBadgeProps {
  type:   'verification' | 'ssl' | 'primary' | 'domain_type'
  status: string
  label?: string
  size?:  'sm' | 'md'
}

const verificationConfig: Record<VerificationStatus, { label: string; icon: React.ReactNode; classes: string }> = {
  verified:   { label: 'Verified',   icon: <CheckCircle className="w-3 h-3" />, classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  pending:    { label: 'Pending',    icon: <Clock       className="w-3 h-3" />, classes: 'bg-amber-500/15  text-amber-400  border-amber-500/30'  },
  unverified: { label: 'Unverified', icon: <Clock       className="w-3 h-3" />, classes: 'bg-zinc-500/15   text-zinc-400   border-zinc-500/30'   },
  failed:     { label: 'Failed',     icon: <XCircle     className="w-3 h-3" />, classes: 'bg-red-500/15    text-red-400    border-red-500/30'    },
}

const sslConfig: Record<SslStatus, { label: string; icon: React.ReactNode; classes: string }> = {
  active:  { label: 'SSL Active',  icon: <Shield className="w-3 h-3" />, classes: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  pending: { label: 'SSL Pending', icon: <Clock  className="w-3 h-3" />, classes: 'bg-amber-500/15  text-amber-400  border-amber-500/30'  },
  failed:  { label: 'SSL Failed',  icon: <XCircle className="w-3 h-3"  />, classes: 'bg-red-500/15    text-red-400    border-red-500/30'    },
}

export function DomainStatusBadge({ type, status, label, size = 'sm' }: DomainStatusBadgeProps) {
  const padClass = size === 'md' ? 'px-3 py-1.5 text-xs' : 'px-2 py-0.5 text-[11px]'

  if (type === 'verification') {
    const key    = status === 'true' || status === 'verified' ? 'verified' : (status as VerificationStatus)
    const config = verificationConfig[key] ?? verificationConfig.unverified
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-1 rounded-full border font-medium ${padClass} ${config.classes}`}
      >
        {config.icon}
        {label ?? config.label}
      </motion.span>
    )
  }

  if (type === 'ssl') {
    const key    = status as SslStatus
    const config = sslConfig[key] ?? sslConfig.pending
    return (
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-1 rounded-full border font-medium ${padClass} ${config.classes}`}
      >
        {config.icon}
        {label ?? config.label}
      </motion.span>
    )
  }

  if (type === 'primary') {
    if (!status || status === 'false') return null
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${padClass} bg-[#c9a84c]/15 text-[#c9a84c] border-[#c9a84c]/30`}>
        <CheckCircle className="w-3 h-3" />
        {label ?? 'Primary'}
      </span>
    )
  }

  if (type === 'domain_type') {
    const isCustom = status === 'custom'
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border font-medium ${padClass} ${
        isCustom
          ? 'bg-violet-500/15 text-violet-400 border-violet-500/30'
          : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
      }`}>
        <Globe className="w-3 h-3" />
        {label ?? (isCustom ? 'Custom' : 'Subdomain')}
      </span>
    )
  }

  return null
}
