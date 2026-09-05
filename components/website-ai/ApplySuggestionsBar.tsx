'use client'
// components/website-ai/ApplySuggestionsBar.tsx

import { CheckCheck, Zap, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  selectedCount: number
  applying: boolean
  onApplyDraft: () => void
  onApplyPublish: () => void
  onCancel: () => void
}

export function ApplySuggestionsBar({
  selectedCount,
  applying,
  onApplyDraft,
  onApplyPublish,
  onCancel,
}: Props) {
  if (selectedCount === 0) return null

  return (
    <div className="sticky top-4 z-40 rounded-2xl border border-gold-500/25 bg-graphite-800/95 p-3 shadow-glow-gold backdrop-blur-xl sm:p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white">Finish creating your website</p>
            <p className="text-xs text-white/45">
              {selectedCount} section{selectedCount !== 1 ? 's' : ''} ready to add
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-2 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70 sm:hidden"
            disabled={applying}
            aria-label="Clear selected sections"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
          <Button variant="secondary" onClick={onApplyDraft} loading={applying} disabled={applying}>
            <CheckCheck className="h-4 w-4" />
            Create draft
          </Button>
          <Button variant="primary" onClick={onApplyPublish} loading={applying} disabled={applying}>
            <Zap className="h-4 w-4" />
            Create &amp; publish
          </Button>
          <button
            type="button"
            onClick={onCancel}
            className="hidden rounded-lg p-2 text-white/30 transition-colors hover:bg-white/5 hover:text-white/70 sm:block"
            disabled={applying}
            aria-label="Clear selected sections"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
