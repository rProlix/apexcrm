'use client'
// components/website-ai/ApplySuggestionsBar.tsx

import { CheckCheck, Zap, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  selectedCount: number
  applying:      boolean
  onApplyDraft:  () => void
  onApplyPublish: () => void
  onCancel:      () => void
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl bg-graphite-800 border border-gold-500/20 shadow-glow-gold backdrop-blur-xl">
      <span className="text-sm font-semibold text-white/70">
        {selectedCount} suggestion{selectedCount !== 1 ? 's' : ''} selected
      </span>
      <div className="w-px h-5 bg-white/10" />
      <Button
        variant="secondary"
        onClick={onApplyDraft}
        loading={applying}
        disabled={applying}
      >
        <CheckCheck className="h-4 w-4" />
        Apply to draft
      </Button>
      <Button
        variant="primary"
        onClick={onApplyPublish}
        loading={applying}
        disabled={applying}
      >
        <Zap className="h-4 w-4" />
        Apply &amp; publish
      </Button>
      <button
        onClick={onCancel}
        className="text-white/30 hover:text-white/70 transition-colors ml-1"
        disabled={applying}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
