// components/domains/PrimaryDomainToggle.tsx
'use client'

import { useState }   from 'react'
import { motion }     from 'framer-motion'
import { Star, Loader2 } from 'lucide-react'

interface PrimaryDomainToggleProps {
  domainId:   string
  isPrimary:  boolean
  isVerified: boolean
  onChange?:  (isPrimary: boolean) => void
  disabled?:  boolean
}

export function PrimaryDomainToggle({
  domainId,
  isPrimary,
  isVerified,
  onChange,
  disabled = false,
}: PrimaryDomainToggleProps) {
  const [loading, setLoading] = useState(false)
  const [primary, setPrimary] = useState(isPrimary)

  const canToggle = isVerified && !disabled && !primary

  const toggle = async () => {
    if (!canToggle) return
    setLoading(true)
    try {
      const res = await fetch(`/api/domains/${domainId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ is_primary: true }),
      })
      if (res.ok) {
        setPrimary(true)
        onChange?.(true)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.button
      type="button"
      onClick={toggle}
      disabled={!canToggle || loading}
      whileHover={canToggle ? { scale: 1.05 } : {}}
      whileTap={canToggle ? { scale: 0.95 } : {}}
      title={primary ? 'Primary domain' : isVerified ? 'Set as primary' : 'Verify domain first'}
      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all ${
        primary
          ? 'bg-[#c9a84c]/20 text-[#c9a84c] cursor-default'
          : canToggle
            ? 'bg-zinc-800/50 text-zinc-400 hover:bg-[#c9a84c]/10 hover:text-[#c9a84c]'
            : 'cursor-not-allowed bg-zinc-800/20 text-zinc-600'
      }`}
    >
      {loading
        ? <Loader2 className="h-3 w-3 animate-spin" />
        : <Star className={`h-3 w-3 ${primary ? 'fill-current' : ''}`} />
      }
      {primary ? 'Primary' : 'Set Primary'}
    </motion.button>
  )
}
