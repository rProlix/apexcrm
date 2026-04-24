'use client'
// components/website-import/SourceAttribution.tsx
import { ExternalLink, Globe, Star, Building2, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SourceType } from '@/lib/website-import/types'

const SOURCE_ICONS: Record<SourceType, React.ElementType> = {
  website:          Globe,
  yelp:             Star,
  business_profile: Building2,
  manual:           FileText,
}

const SOURCE_LABELS: Record<SourceType, string> = {
  website:          'Website',
  yelp:             'Yelp',
  business_profile: 'Business Profile',
  manual:           'Manual',
}

interface Props {
  sourceUrl:  string
  sourceType: SourceType
  className?: string
}

export function SourceAttribution({ sourceUrl, sourceType, className }: Props) {
  const Icon  = SOURCE_ICONS[sourceType] ?? Globe
  const label = SOURCE_LABELS[sourceType] ?? sourceType

  let displayUrl: string
  try {
    displayUrl = new URL(sourceUrl).hostname
  } catch {
    displayUrl = sourceUrl.slice(0, 40)
  }

  return (
    <span className={cn('inline-flex items-center gap-1 text-xs text-white/40', className)}>
      <Icon size={11} className="flex-shrink-0 text-white/30" />
      <span className="text-white/30">{label}:</span>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-amber-300/80 transition-colors truncate max-w-[160px]"
        title={sourceUrl}
      >
        {displayUrl}
      </a>
      <ExternalLink size={9} className="flex-shrink-0 text-white/20" />
    </span>
  )
}
