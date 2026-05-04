'use client'
// components/website-ai/PasteDetailsPanel.tsx

import { useState } from 'react'
import { Wand2, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const SOURCE_TYPES = [
  { value: 'mixed',            label: 'Mixed / General' },
  { value: 'pasted_text',      label: 'Pasted text' },
  { value: 'reviews',          label: 'Customer reviews' },
  { value: 'services',         label: 'Services & prices' },
  { value: 'products',         label: 'Products / menu' },
  { value: 'business_profile', label: 'Business description' },
  { value: 'contact_hours',    label: 'Hours & contact info' },
  { value: 'faq',              label: 'FAQs' },
  { value: 'policies',         label: 'Policies' },
]

const TIPS = [
  'You can paste multiple types of content at once — Gemini detects each type separately.',
  'Include the source name for reviews (e.g. "Maria G: Great service!").',
  'For services, include prices: "Oil change $79, Tire rotation $35".',
  'For hours, natural language works: "Mon–Fri 9am–6pm, closed weekends".',
  'Social links can be pasted as plain URLs or usernames.',
]

interface Props {
  tenantId:   string
  isOwner:    boolean
  onAnalyzed: (jobId: string) => void
}

export function PasteDetailsPanel({ tenantId, isOwner, onAnalyzed }: Props) {
  const [rawInput,    setRawInput]    = useState('')
  const [sourceType,  setSourceType]  = useState('mixed')
  const [analyzing,   setAnalyzing]   = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [tipsOpen,    setTipsOpen]    = useState(false)

  const charCount = rawInput.length
  const charLimit = 20_000

  async function handleAnalyze() {
    if (!rawInput.trim()) return
    setAnalyzing(true)
    setError(null)

    try {
      // 1. Create the job
      const createRes = await fetch('/api/website-ai/imports', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tenantId, rawInput, sourceType }),
      })
      const createJson = await createRes.json()
      if (!createRes.ok) throw new Error(createJson.error ?? 'Failed to create import job')

      const jobId = createJson.job.id

      // 2. Trigger analysis
      const analyzeRes = await fetch(`/api/website-ai/imports/${jobId}/analyze`, {
        method: 'POST',
      })
      const analyzeJson = await analyzeRes.json()
      if (!analyzeRes.ok) throw new Error(analyzeJson.error ?? 'Gemini analysis failed')

      setRawInput('')
      onAnalyzed(jobId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="rounded-2xl bg-graphite-800/60 border border-surface-border p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center shrink-0">
          <Wand2 className="h-4.5 w-4.5 text-gold-400" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Paste Business Details</h2>
          <p className="text-xs text-white/40">Gemini will organize them into structured website content.</p>
        </div>
      </div>

      {/* Source type */}
      <div>
        <label className="text-2xs text-white/40 uppercase tracking-wide block mb-1.5">Content type</label>
        <select
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value)}
          className="w-full bg-graphite-900 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-gold-500/40 appearance-none"
        >
          {SOURCE_TYPES.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Textarea */}
      <div>
        <label className="text-2xs text-white/40 uppercase tracking-wide block mb-1.5">Paste content here</label>
        <textarea
          value={rawInput}
          onChange={(e) => setRawInput(e.target.value.slice(0, charLimit))}
          rows={8}
          placeholder="Paste reviews, services, business hours, contact info, product listings, FAQs, policies, or any other business content..."
          className={cn(
            'w-full bg-graphite-900 border rounded-xl px-4 py-3 text-sm text-white placeholder-white/20',
            'focus:outline-none focus:border-gold-500/30 resize-none transition-colors',
            'border-white/10',
          )}
        />
        <div className="flex items-center justify-between mt-1.5">
          <button
            type="button"
            onClick={() => setTipsOpen(!tipsOpen)}
            className="flex items-center gap-1 text-2xs text-white/30 hover:text-white/60 transition-colors"
          >
            {tipsOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Tips & examples
          </button>
          <span className={cn('text-2xs', charCount > charLimit * 0.9 ? 'text-gold-400' : 'text-white/25')}>
            {charCount.toLocaleString()} / {charLimit.toLocaleString()}
          </span>
        </div>
        {tipsOpen && (
          <div className="mt-2 rounded-xl bg-graphite-900/60 border border-white/8 p-3 space-y-1.5">
            {TIPS.map((tip, i) => (
              <p key={i} className="text-xs text-white/40">• {tip}</p>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      <Button
        variant="primary"
        onClick={handleAnalyze}
        loading={analyzing}
        disabled={!rawInput.trim() || analyzing}
        className="w-full justify-center"
      >
        <Wand2 className="h-4 w-4" />
        {analyzing ? 'Gemini is analyzing…' : 'Analyze with Gemini'}
      </Button>
    </div>
  )
}
