'use client'
// components/website-import/ImportJobList.tsx
import { motion } from 'framer-motion'
import Link from 'next/link'
import { Clock, ArrowRight, Globe, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ImportStatusBadge } from './ImportStatusBadge'
import { ConfidenceMeter } from './ConfidenceMeter'
import { staggerContainer, fadeUp } from '@/lib/motion'
import type { ImportJobStatus } from '@/lib/website-import/types'

export interface JobListItem {
  id:          string
  status:      ImportJobStatus
  progress:    number
  source_urls: string[]
  notes:       string | null
  error_message: string | null
  started_at:  string | null
  completed_at: string | null
  created_at:  string
  updated_at:  string
  website_import_sources?: Array<{
    id:               string
    source_url:       string
    source_type:      string
    fetched_status:   string
    confidence_score: number
    page_title:       string | null
  }>
}

interface Props {
  jobs:          JobListItem[]
  activeJobId?:  string
  onSelect?:     (job: JobListItem) => void
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function ImportJobList({ jobs, activeJobId, onSelect }: Props) {
  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-8 text-center">
        <Layers size={24} className="mx-auto text-white/15 mb-3" />
        <p className="text-sm text-white/30">No import jobs yet.</p>
        <p className="text-xs text-white/20 mt-1">Paste URLs above to start your first import.</p>
      </div>
    )
  }

  return (
    <motion.div
      variants={staggerContainer(0.05)}
      initial="hidden"
      animate="visible"
      className="space-y-2"
    >
      {jobs.map((job) => {
        const sources     = job.website_import_sources ?? []
        const avgConf     = sources.length
          ? sources.reduce((s, r) => s + r.confidence_score, 0) / sources.length
          : 0
        const primaryUrl  = sources[0]?.source_url ?? job.source_urls[0] ?? ''
        let displayDomain = ''
        try { displayDomain = new URL(primaryUrl).hostname } catch { displayDomain = primaryUrl.slice(0, 40) }

        const isActive = job.id === activeJobId

        return (
          <motion.div key={job.id} variants={fadeUp}>
            {onSelect ? (
              <button
                onClick={() => onSelect(job)}
                className={cn(
                  'w-full text-left rounded-xl border p-4 transition-all duration-200 group',
                  isActive
                    ? 'border-amber-400/30 bg-amber-400/[0.06]'
                    : 'border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
                )}
              >
                <JobRowContent job={job} displayDomain={displayDomain} avgConf={avgConf} sources={sources} />
              </button>
            ) : (
              <Link
                href={`/website/import/${job.id}`}
                className={cn(
                  'block rounded-xl border p-4 transition-all duration-200 group',
                  isActive
                    ? 'border-amber-400/30 bg-amber-400/[0.06]'
                    : 'border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]',
                )}
              >
                <JobRowContent job={job} displayDomain={displayDomain} avgConf={avgConf} sources={sources} />
              </Link>
            )}
          </motion.div>
        )
      })}
    </motion.div>
  )
}

function JobRowContent({
  job,
  displayDomain,
  avgConf,
  sources,
}: {
  job:           JobListItem
  displayDomain: string
  avgConf:       number
  sources:       JobListItem['website_import_sources']
}) {
  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Globe size={14} className="text-white/30 flex-shrink-0" />
          <span className="text-sm font-medium text-white/70 truncate">{displayDomain}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <ImportStatusBadge status={job.status} />
          <ArrowRight size={13} className="text-white/20 group-hover:text-amber-300/50 transition-colors" />
        </div>
      </div>

      {/* Progress bar (if running or completed) */}
      {(job.status === 'running' || job.status === 'completed') && (
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-500',
              job.status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400',
            )}
            style={{ width: `${job.progress}%` }}
          />
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-white/30">
          <span className="flex items-center gap-1">
            <Clock size={10} />
            {formatRelativeTime(job.created_at)}
          </span>
          {(sources?.length ?? 0) > 0 && (
            <span>{sources?.length} source{(sources?.length ?? 0) !== 1 ? 's' : ''}</span>
          )}
        </div>

        {job.status === 'completed' && avgConf > 0 && (
          <ConfidenceMeter score={avgConf} size="xs" showLabel={false} />
        )}

        {job.status === 'failed' && job.error_message && (
          <span className="text-red-400/60 truncate max-w-[160px]" title={job.error_message}>
            {job.error_message.slice(0, 50)}
          </span>
        )}
      </div>
    </div>
  )
}
