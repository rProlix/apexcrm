'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { goldPulse } from '@/lib/motion'

interface LiveBadgeProps {
  label?:    string
  className?: string
}

export function LiveBadge({ label = 'Live', className }: LiveBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full',
        'bg-gold-500/10 border border-gold-500/25 text-gold-400 text-xs font-semibold',
        className
      )}
    >
      <motion.span
        className="h-1.5 w-1.5 rounded-full bg-gold-400"
        animate={goldPulse.animate}
      />
      {label}
    </span>
  )
}
