'use client'
// components/website-import/SourceCard.tsx
import { Globe, Star, Building2, FileText, CheckCircle2, XCircle, Clock, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfidenceMeter } from './ConfidenceMeter'
import type { SourceType } from '@/lib/website-import/types'

interface Props {
  source: {
    id:               string
    source_url:       string
    source_type:      string
    page_title:       string | null
    fetched_status:   string
    confidence_score: number
    raw_metadata?:    Record<string, unknown> | null
  }
}

const TYPE_ICONS: Record<SourceType, React.ElementType> = {
  website:          Globe,
  yelp:             Star,
  business_profile: Building2,
  manual:           FileText,
}

const TYPE_LABELS: Record<SourceType, string> = {
  website:          'Business Website',
  yelp:             'Yelp',
  business_profile: 'Business Profile',
  manual:           'Manual',
}

export function SourceCard({ source }: Props) {
  const Icon       = TYPE_ICONS[source.source_type as SourceType] ?? Globe
  const typeLabel  = TYPE_LABELS[source.source_type as SourceType] ?? source.source_type
  const isFetched  = source.fetched_status === 'fetched'
  const isFailed   = source.fetched_status === 'failed'
  const isPending  = source.fetched_status === 'pending'

  let displayDomain: string
  try {
    displayDomain = new URL(source.source_url).hostname
  } catch {
    displayDomain = source.source_url.slice(0, 50)
  }

  const meta = source.raw_metadata as Record<string, unknown> | null

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3 transition-colors',
      isFetched && 'border-white/10 bg-white/[0.03]',
      isFailed  && 'border-red-400/20 bg-red-400/[0.03]',
      isPending && 'border-white/8 bg-white/[0.02]',
    )}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn(
            'flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center',
            isFetched ? 'bg-amber-400/10' : 'bg-white/5',
          )}>
            <Icon size={15} className={isFetched ? 'text-amber-300/70' : 'text-white/30'} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-white/80 truncate">
              {source.page_title ?? displayDomain}
            </p>
            <p className="text-xs text-white/30">{typeLabel}</p>
          </div>
        </div>

        {/* Status icon */}
        <div className="flex-shrink-0">
          {isFetched && <CheckCircle2 size={16} className="text-emerald-400/80" />}
          {isFailed  && <XCircle     size={16} className="text-red-400/80" />}
          {isPending && <Clock        size={16} className="text-white/20 animate-pulse" />}
        </div>
      </div>

      {/* URL */}
      <div className="flex items-center gap-1.5">
        <a
          href={source.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-white/30 hover:text-amber-300/70 truncate transition-colors flex items-center gap-1"
        >
          {displayDomain}
          <ExternalLink size={9} className="flex-shrink-0" />
        </a>
      </div>

      {/* Metadata preview */}
      {isFetched && meta && (
        <div className="space-y-1 text-xs">
          {meta.og && typeof meta.og === 'object' && (meta.og as Record<string, unknown>).description && (
            <p className="text-white/40 line-clamp-2">
              {String((meta.og as Record<string, unknown>).description)}
            </p>
          )}
          {meta.structured && typeof meta.structured === 'object' && (
            <p className="text-white/30">
              Schema.org: {String((meta.structured as Record<string, unknown>).type ?? 'Unknown')}
              {(meta.structured as Record<string, unknown>).name && (
                <> — {String((meta.structured as Record<string, unknown>).name)}</>
              )}
            </p>
          )}
        </div>
      )}

      {/* Error message */}
      {isFailed && meta?.error && (
        <p className="text-xs text-red-400/70">
          {String(meta.error)}
        </p>
      )}

      {/* Confidence score */}
      {isFetched && (
        <div className="flex items-center gap-2 pt-1 border-t border-white/5">
          <span className="text-xs text-white/30">Confidence:</span>
          <ConfidenceMeter score={source.confidence_score} size="xs" />
        </div>
      )}
    </div>
  )
}
