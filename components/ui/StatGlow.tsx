'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { fadeUp } from '@/lib/motion'

interface StatGlowProps {
  value:     string | number
  label:     string
  color?:    string  // Tailwind text color class
  className?: string
}

export function StatGlow({ value, label, color = 'text-gold-400', className }: StatGlowProps) {
  return (
    <motion.div
      variants={fadeUp}
      className={cn('flex flex-col gap-0.5', className)}
    >
      <span className={cn('text-2xl font-bold tabular-nums tracking-tight', color)}>
        {value}
      </span>
      <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
    </motion.div>
  )
}
