'use client'
// components/website-ai/SuggestionPreview.tsx
// Read-only visual preview of a suggestion's proposed content.

import { cn } from '@/lib/utils'

interface Props {
  suggestionType: string
  proposedSection: Record<string, unknown>
}

export function SuggestionPreview({ suggestionType, proposedSection: ps }: Props) {
  if (suggestionType === 'reviews' || suggestionType === 'testimonials') {
    const items = (Array.isArray(ps.items) ? ps.items : []) as Array<Record<string, unknown>>
    return (
      <div className="space-y-2 mt-2">
        {items.slice(0, 3).map((item, i) => (
          <div key={i} className="rounded-lg bg-graphite-700/40 border border-white/6 p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-white/80">{String(item.name ?? 'Customer')}</span>
              {!!item.rating && (
                <span className="text-gold-400 text-xs">{'★'.repeat(Number(item.rating))}</span>
              )}
            </div>
            <p className="text-xs text-white/50 italic">&ldquo;{String(item.text ?? item.quote ?? '')}&rdquo;</p>
          </div>
        ))}
      </div>
    )
  }

  if (suggestionType === 'services') {
    const items = (Array.isArray(ps.items) ? ps.items : []) as Array<Record<string, unknown>>
    return (
      <div className="grid grid-cols-2 gap-2 mt-2">
        {items.slice(0, 4).map((item, i) => (
          <div key={i} className="rounded-lg bg-graphite-700/40 border border-white/6 p-2.5">
            <p className="text-xs font-semibold text-white/80 mb-0.5">{String(item.title ?? 'Service')}</p>
            <p className="text-2xs text-white/40 leading-relaxed">{String(item.description ?? '')}</p>
          </div>
        ))}
      </div>
    )
  }

  if (suggestionType === 'faq') {
    const items = (Array.isArray(ps.items) ? ps.items : []) as Array<Record<string, unknown>>
    return (
      <div className="space-y-1.5 mt-2">
        {items.slice(0, 3).map((item, i) => (
          <div key={i} className="rounded-lg bg-graphite-700/40 border border-white/6 p-2.5">
            <p className="text-xs font-semibold text-white/70 mb-0.5">{String(item.question ?? '')}</p>
            <p className="text-2xs text-white/40">{String(item.answer ?? '')}</p>
          </div>
        ))}
      </div>
    )
  }

  if (suggestionType === 'hero' || suggestionType === 'about') {
    return (
      <div className="mt-2 rounded-lg bg-graphite-700/40 border border-white/6 p-3">
        {!!ps.headline && (
          <p className="text-sm font-bold text-white mb-1">{String(ps.headline)}</p>
        )}
        {!!ps.subheadline && (
          <p className="text-xs text-white/50">{String(ps.subheadline)}</p>
        )}
        {!!ps.body && (
          <p className="text-xs text-white/50">{String(ps.body)}</p>
        )}
      </div>
    )
  }

  if (suggestionType === 'contact' || suggestionType === 'hours') {
    const fields = ['phone', 'email', 'address', 'body'] as const
    return (
      <div className="mt-2 rounded-lg bg-graphite-700/40 border border-white/6 p-3 space-y-1">
        {fields.map((f) =>
          ps[f] ? (
            <div key={f} className="flex items-start gap-2">
              <span className="text-2xs text-white/30 uppercase tracking-wide min-w-[48px]">{f}</span>
              <span className="text-xs text-white/60">{String(ps[f])}</span>
            </div>
          ) : null
        )}
        {Array.isArray(ps.hours) && (ps.hours as Array<Record<string, unknown>>).slice(0, 4).map((h, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-2xs text-white/30 w-20">{String(h.day ?? '')}</span>
            <span className="text-xs text-white/60">
              {h.closed ? 'Closed' : `${h.open} – ${h.close}`}
            </span>
          </div>
        ))}
      </div>
    )
  }

  // Generic fallback
  const heading = (ps.heading ?? ps.headline) as string | undefined
  const body    = (ps.body ?? ps.subheading ?? ps.text) as string | undefined

  if (!heading && !body) return null

  return (
    <div className="mt-2 rounded-lg bg-graphite-700/40 border border-white/6 p-3">
      {heading && <p className="text-sm font-semibold text-white/80 mb-1">{heading}</p>}
      {body    && <p className="text-xs text-white/50">{body}</p>}
    </div>
  )
}
