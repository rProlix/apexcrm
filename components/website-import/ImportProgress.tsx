'use client'
// components/website-import/ImportProgress.tsx
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ImportJobStatus } from '@/lib/website-import/types'

interface Props {
  status:   ImportJobStatus
  progress: number
  message?: string
  sources?: Array<{
    id:             string
    source_url:     string
    source_type:    string
    fetched_status: string
    page_title:     string | null
  }>
}

const STAGE_LABELS: Record<number, string> = {
  5:  'Starting import…',
  20: 'Fetching sources…',
  40: 'Fetching sources…',
  60: 'Parsing content…',
  65: 'Extracting business data…',
  80: 'Mapping to site structure…',
  90: 'Saving draft…',
  100: 'Import complete!',
}

function getStageLabel(progress: number): string {
  const stages = Object.keys(STAGE_LABELS).map(Number).sort((a, b) => b - a)
  for (const stage of stages) {
    if (progress >= stage) return STAGE_LABELS[stage]
  }
  return 'Processing…'
}

export function ImportProgress({ status, progress, message, sources }: Props) {
  const isRunning   = status === 'running'
  const isCompleted = status === 'completed'
  const isFailed    = status === 'failed'
  const isCanceled  = status === 'canceled'

  return (
    <div className="space-y-4">
      {/* Main progress bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-white/60 flex items-center gap-2">
            {isRunning && <Loader2 size={14} className="animate-spin text-amber-400" />}
            {isCompleted && <CheckCircle2 size={14} className="text-emerald-400" />}
            {isFailed   && <XCircle size={14} className="text-red-400" />}
            {isCanceled && <AlertCircle size={14} className="text-white/30" />}
            <span>{isRunning ? getStageLabel(progress) : message ?? status}</span>
          </span>
          <span className="text-white/40 tabular-nums text-xs font-medium">
            {progress}%
          </span>
        </div>

        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full',
              isCompleted ? 'bg-emerald-400' : isFailed ? 'bg-red-400/70' : 'bg-gradient-to-r from-amber-500 to-amber-300',
            )}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Source-level status */}
      {sources && sources.length > 0 && (
        <div className="space-y-1.5">
          {sources.map((src) => (
            <div
              key={src.id}
              className="flex items-center gap-2.5 text-xs py-1"
            >
              <SourceStatusDot status={src.fetched_status} />
              <span className="text-white/50 truncate flex-1 min-w-0" title={src.source_url}>
                {src.page_title ?? src.source_url}
              </span>
              <span className={cn(
                'flex-shrink-0 text-[11px]',
                src.fetched_status === 'fetched' && 'text-emerald-400/70',
                src.fetched_status === 'failed'  && 'text-red-400/70',
                src.fetched_status === 'pending' && 'text-white/30',
              )}>
                {src.fetched_status === 'fetched' ? 'Fetched' : src.fetched_status === 'failed' ? 'Failed' : 'Pending'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SourceStatusDot({ status }: { status: string }) {
  return (
    <span className={cn(
      'w-1.5 h-1.5 rounded-full flex-shrink-0',
      status === 'fetched' && 'bg-emerald-400',
      status === 'failed'  && 'bg-red-400',
      status === 'pending' && 'bg-white/20 animate-pulse',
    )} />
  )
}
