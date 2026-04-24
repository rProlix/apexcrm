'use client'
// components/website-import/ExtractedFieldReview.tsx
import { useState } from 'react'
import { Check, X, Edit3, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ConfidenceMeter } from './ConfidenceMeter'

export interface ReviewField {
  id:              string
  result_key:      string
  mapped_section:  string | null
  result_value:    unknown
  confidence_score: number
  approved:        boolean
}

interface Props {
  fields:     ReviewField[]
  onApprove:  (ids: string[], approved: boolean, overrides?: Record<string, unknown>) => Promise<void>
  disabled?:  boolean
}

const FIELD_LABELS: Record<string, string> = {
  businessName:   'Business Name',
  description:    'About / Description',
  logoUrl:        'Logo URL',
  faviconUrl:     'Favicon URL',
  phone:          'Phone Number',
  email:          'Email Address',
  address:        'Address',
  hours:          'Hours of Operation',
  socialLinks:    'Social Links',
  services:       'Services',
  testimonials:   'Testimonials',
  faqItems:       'FAQ Items',
  images:         'Images',
  brandColors:    'Brand Colors',
  seoTitle:       'SEO Title',
  seoDescription: 'SEO Description',
  mapUrl:         'Map URL',
  latitude:       'Latitude',
  longitude:      'Longitude',
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value.slice(0, 200)
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty)'
    return `${value.length} items`
  }
  if (typeof value === 'object') return JSON.stringify(value, null, 2).slice(0, 400)
  return String(value)
}

function isLowConfidence(score: number) { return score < 0.50 }

export function ExtractedFieldReview({ fields, onApprove, disabled }: Props) {
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set())
  const [editing,   setEditing]   = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [pending,   setPending]   = useState<Set<string>>(new Set())

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleApprove(id: string, approved: boolean) {
    setPending((prev) => new Set([...prev, id]))
    await onApprove([id], approved)
    setPending((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  async function handleApproveAll() {
    const ids = fields.filter((f) => !f.approved).map((f) => f.id)
    if (ids.length === 0) return
    ids.forEach((id) => setPending((prev) => new Set([...prev, id])))
    await onApprove(ids, true)
    ids.forEach((id) => setPending((prev) => { const n = new Set(prev); n.delete(id); return n }))
  }

  async function handleSaveEdit(field: ReviewField) {
    let value: unknown = editValue
    try {
      value = JSON.parse(editValue)
    } catch {
      // Keep as string
    }
    await onApprove([field.id], true, { [field.id]: value })
    setEditing(null)
  }

  const approvedCount = fields.filter((f) => f.approved).length
  const lowConfCount  = fields.filter((f) => isLowConfidence(f.confidence_score)).length

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-white/60">
            {approvedCount}/{fields.length} fields approved
          </p>
          {lowConfCount > 0 && (
            <p className="flex items-center gap-1 text-xs text-amber-300/60 mt-0.5">
              <AlertTriangle size={11} />
              {lowConfCount} low-confidence fields need review
            </p>
          )}
        </div>
        <button
          onClick={handleApproveAll}
          disabled={disabled || approvedCount === fields.length}
          className="text-xs text-amber-300/80 hover:text-amber-200 transition-colors disabled:opacity-40"
        >
          Approve all
        </button>
      </div>

      {/* Fields list */}
      <div className="space-y-2">
        {fields.map((field) => {
          const isExpanded    = expanded.has(field.id)
          const isEditingThis = editing === field.id
          const isPending     = pending.has(field.id)
          const isLow         = isLowConfidence(field.confidence_score)
          const label         = FIELD_LABELS[field.result_key] ?? field.result_key

          return (
            <div
              key={field.id}
              className={cn(
                'rounded-xl border transition-all',
                field.approved
                  ? 'border-emerald-400/20 bg-emerald-400/[0.03]'
                  : isLow
                    ? 'border-amber-400/20 bg-amber-400/[0.03]'
                    : 'border-white/8 bg-white/[0.02]',
              )}
            >
              {/* Row header */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Approve / Reject */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleApprove(field.id, !field.approved)}
                    disabled={disabled || isPending}
                    title={field.approved ? 'Approved — click to undo' : 'Approve this field'}
                    className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center transition-all',
                      field.approved
                        ? 'bg-emerald-400/20 text-emerald-300'
                        : 'bg-white/5 text-white/20 hover:bg-emerald-400/10 hover:text-emerald-400/70',
                    )}
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={() => handleApprove(field.id, false)}
                    disabled={disabled || isPending || !field.approved}
                    title="Reject this field"
                    className={cn(
                      'w-6 h-6 rounded-md flex items-center justify-center transition-all',
                      !field.approved && 'opacity-0 pointer-events-none',
                      'bg-white/5 text-white/20 hover:bg-red-400/10 hover:text-red-400/70',
                    )}
                  >
                    <X size={12} />
                  </button>
                </div>

                {/* Field name */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white/70">{label}</span>
                    {field.mapped_section && (
                      <span className="text-[10px] text-white/25 bg-white/5 px-1.5 py-0.5 rounded">
                        {field.mapped_section}
                      </span>
                    )}
                    {isLow && !field.approved && (
                      <span className="text-[10px] text-amber-400/70 bg-amber-400/10 px-1.5 py-0.5 rounded">
                        Low confidence
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-white/30 truncate mt-0.5">
                    {formatValue(field.result_value)}
                  </p>
                </div>

                {/* Confidence */}
                <ConfidenceMeter score={field.confidence_score} size="xs" />

                {/* Edit button */}
                <button
                  onClick={() => {
                    if (isEditingThis) { setEditing(null); return }
                    setEditing(field.id)
                    setEditValue(typeof field.result_value === 'string'
                      ? field.result_value
                      : JSON.stringify(field.result_value, null, 2))
                  }}
                  className="flex-shrink-0 p-1.5 text-white/20 hover:text-white/50 transition-colors"
                  title="Edit value"
                >
                  <Edit3 size={12} />
                </button>

                {/* Expand */}
                <button
                  onClick={() => toggleExpand(field.id)}
                  className="flex-shrink-0 p-1.5 text-white/20 hover:text-white/50 transition-colors"
                >
                  {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>

              {/* Expanded value / Edit */}
              {(isExpanded || isEditingThis) && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                  {isEditingThis ? (
                    <div className="space-y-2">
                      <textarea
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 font-mono outline-none focus:border-amber-400/40 transition-colors resize-y"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(field)}
                          className="text-xs text-emerald-300 hover:text-emerald-200 transition-colors"
                        >
                          Save &amp; Approve
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="text-xs text-white/30 hover:text-white/50 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <pre className="text-xs text-white/50 font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
                      {formatValue(field.result_value)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
