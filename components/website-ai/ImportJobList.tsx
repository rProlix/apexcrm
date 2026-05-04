'use client'
// components/website-ai/ImportJobList.tsx
// Compact list of past import jobs.

import { motion } from 'framer-motion'
import { staggerContainer, fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'
import type { AiImportJob } from '@/lib/website-ai/types'

const STATUS_STYLE: Record<string, string> = {
  draft:     'text-white/40 bg-white/8 border-white/10',
  analyzing: 'text-gold-400 bg-gold-500/10 border-gold-500/20',
  ready:     'text-violet-400 bg-violet-500/10 border-violet-500/20',
  applied:   'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  failed:    'text-red-400 bg-red-500/10 border-red-500/20',
  cancelled: 'text-white/25 bg-white/5 border-white/8',
}

interface Props {
  jobs:     Partial<AiImportJob>[]
  selected: string | null
  onSelect: (id: string) => void
}

export function ImportJobList({ jobs, selected, onSelect }: Props) {
  if (!jobs.length) {
    return (
      <p className="text-xs text-white/30 text-center py-6">No import jobs yet.</p>
    )
  }

  return (
    <motion.div
      variants={staggerContainer(0.04)}
      initial="hidden"
      animate="visible"
      className="space-y-1.5"
    >
      {jobs.map((job) => (
        <motion.button
          key={job.id}
          variants={fadeUp}
          onClick={() => job.id && onSelect(job.id)}
          className={cn(
            'w-full text-left rounded-xl border px-3.5 py-3 transition-all duration-150',
            selected === job.id
              ? 'bg-gold-500/8 border-gold-500/20'
              : 'bg-graphite-800/50 border-surface-border hover:border-white/15 hover:bg-graphite-700/40',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">
                {job.summary ?? job.source_type ?? 'Import job'}
              </p>
              <p className="text-2xs text-white/30 mt-0.5">
                {job.created_at ? new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
              </p>
            </div>
            <span className={cn('shrink-0 text-2xs font-semibold px-2 py-0.5 rounded border uppercase tracking-wide', STATUS_STYLE[job.status ?? 'draft'])}>
              {job.status}
            </span>
          </div>
        </motion.button>
      ))}
    </motion.div>
  )
}
