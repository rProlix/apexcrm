'use client'
// components/website-ai/SuggestionCard.tsx

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Pencil, ThumbsDown, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { fadeUp } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { ConfidenceBadge } from './ConfidenceBadge'
import { SuggestionPreview } from './SuggestionPreview'
import { SuggestionEditor } from './SuggestionEditor'
import type { AiSuggestion } from '@/lib/website-ai/types'

const TYPE_COLOR: Record<string, string> = {
  reviews:      'bg-violet-500/10 border-violet-500/20 text-violet-400',
  testimonials: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
  services:     'bg-blue-500/10 border-blue-500/20 text-blue-400',
  products:     'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  menu:         'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  hero:         'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
  about:        'bg-indigo-500/10 border-indigo-500/20 text-indigo-400',
  hours:        'bg-gold-500/10 border-gold-500/20 text-gold-400',
  contact:      'bg-pink-500/10 border-pink-500/20 text-pink-400',
  faq:          'bg-orange-500/10 border-orange-500/20 text-orange-400',
  seo:          'bg-teal-500/10 border-teal-500/20 text-teal-400',
  promotion:    'bg-rose-500/10 border-rose-500/20 text-rose-400',
  social_links: 'bg-sky-500/10 border-sky-500/20 text-sky-400',
  policies:     'bg-red-500/10 border-red-500/20 text-red-400',
}

interface Props {
  suggestion:  AiSuggestion
  selected:    boolean
  onToggle:    (id: string) => void
  onUpdate:    (id: string, updates: Record<string, string>) => Promise<void>
  onReject:    (id: string) => Promise<void>
}

export function SuggestionCard({ suggestion, selected, onToggle, onUpdate, onReject }: Props) {
  const [expanded,   setExpanded]   = useState(false)
  const [editing,    setEditing]    = useState(false)
  const [rejecting,  setRejecting]  = useState(false)

  const isRejected = suggestion.status === 'rejected'
  const isApplied  = suggestion.status === 'applied'
  const typeColor  = TYPE_COLOR[suggestion.suggestion_type] ?? 'bg-white/8 border-white/10 text-white/40'

  async function handleReject() {
    setRejecting(true)
    try { await onReject(suggestion.id) }
    finally { setRejecting(false) }
  }

  return (
    <motion.div
      variants={fadeUp}
      className={cn(
        'rounded-2xl border transition-all duration-200',
        isRejected
          ? 'bg-graphite-800/30 border-white/5 opacity-50'
          : isApplied
            ? 'bg-emerald-500/5 border-emerald-500/15'
            : selected
              ? 'bg-gold-500/5 border-gold-500/20'
              : 'bg-graphite-800/60 border-surface-border hover:border-white/15',
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Checkbox */}
          {!isRejected && !isApplied && (
            <button
              onClick={() => onToggle(suggestion.id)}
              className={cn(
                'shrink-0 mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center transition-all duration-150',
                selected
                  ? 'bg-gold-500 border-gold-500'
                  : 'border-white/20 hover:border-gold-400/50',
              )}
            >
              {selected && <Check className="h-3 w-3 text-graphite-900" strokeWidth={3} />}
            </button>
          )}
          {isApplied && (
            <div className="shrink-0 mt-0.5 h-5 w-5 rounded-md bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <Check className="h-3 w-3 text-emerald-400" strokeWidth={3} />
            </div>
          )}
          {isRejected && (
            <div className="shrink-0 mt-0.5 h-5 w-5 rounded-md bg-white/5 border border-white/10" />
          )}

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn('text-2xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border', typeColor)}>
                {suggestion.suggestion_type.replace(/_/g, ' ')}
              </span>
              <span className="text-2xs text-white/25 uppercase tracking-wide border border-white/10 px-1.5 py-0.5 rounded">
                {suggestion.action}
              </span>
              <ConfidenceBadge confidence={suggestion.confidence} />
              {isApplied && (
                <span className="text-2xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded">
                  Applied
                </span>
              )}
            </div>
            <p className="text-sm font-semibold text-white">
              {suggestion.title ?? suggestion.suggestion_type}
            </p>
            {suggestion.reason && (
              <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{suggestion.reason}</p>
            )}
          </div>

          {/* Actions */}
          {!isRejected && !isApplied && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setEditing(!editing)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleReject}
                disabled={rejecting}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/8 transition-colors"
                title="Reject"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setExpanded(!expanded)}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/8 transition-colors"
                title={expanded ? 'Collapse' : 'Preview'}
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          )}
        </div>

        {/* Expanded preview */}
        {expanded && !editing && (
          <SuggestionPreview
            suggestionType={suggestion.suggestion_type}
            proposedSection={suggestion.proposed_section as Record<string, unknown>}
          />
        )}

        {/* Inline editor */}
        {editing && (
          <SuggestionEditor
            suggestion={suggestion}
            onSave={(updates) => onUpdate(suggestion.id, updates)}
            onClose={() => setEditing(false)}
          />
        )}

        {suggestion.admin_notes && !editing && (
          <p className="mt-2 text-2xs text-gold-400/60 italic">{suggestion.admin_notes}</p>
        )}
      </div>
    </motion.div>
  )
}
