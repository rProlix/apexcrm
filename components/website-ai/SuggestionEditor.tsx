'use client'
// components/website-ai/SuggestionEditor.tsx
// Inline editor for tweaking a suggestion before applying.

import { useState } from 'react'
import { X, Save } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface Props {
  suggestion: {
    id:          string
    title:       string | null
    description: string | null
    admin_notes: string | null
  }
  onSave:  (updates: Record<string, string>) => Promise<void>
  onClose: () => void
}

export function SuggestionEditor({ suggestion, onSave, onClose }: Props) {
  const [title,      setTitle]      = useState(suggestion.title ?? '')
  const [adminNotes, setAdminNotes] = useState(suggestion.admin_notes ?? '')
  const [saving,     setSaving]     = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await onSave({ title, admin_notes: adminNotes, status: 'edited' })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl bg-graphite-700/50 border border-white/10 p-4 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">Edit suggestion</p>
        <button onClick={onClose} className="text-white/30 hover:text-white/70 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div>
        <label className="text-2xs text-white/40 uppercase tracking-wide block mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-graphite-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-500/40"
        />
      </div>
      <div>
        <label className="text-2xs text-white/40 uppercase tracking-wide block mb-1">Notes</label>
        <textarea
          value={adminNotes}
          onChange={(e) => setAdminNotes(e.target.value)}
          rows={2}
          placeholder="Optional notes about this suggestion..."
          className="w-full bg-graphite-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-gold-500/40 resize-none"
        />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-white/40 hover:text-white/70 px-3 py-1.5 transition-colors">
          Cancel
        </button>
        <Button variant="primary" onClick={handleSave} loading={saving}>
          <Save className="h-3.5 w-3.5" />
          Save
        </Button>
      </div>
    </div>
  )
}
