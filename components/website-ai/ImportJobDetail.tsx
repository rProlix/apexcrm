'use client'
// components/website-ai/ImportJobDetail.tsx
// Full detail view of a selected import job.

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { staggerContainer } from '@/lib/motion'
import { AlertTriangle, HelpCircle, CheckCheck, ExternalLink, X } from 'lucide-react'
import { ConfidenceBadge } from './ConfidenceBadge'
import { DetectedContentChips } from './DetectedContentChips'
import { SuggestionCard } from './SuggestionCard'
import { ApplySuggestionsBar } from './ApplySuggestionsBar'
import type { AiImportJob, AiSuggestion } from '@/lib/website-ai/types'

interface Props {
  jobId: string
  tenantId: string
  onDone: () => void
}

export function ImportJobDetail({ jobId, tenantId, onDone }: Props) {
  const [job, setJob] = useState<AiImportJob | null>(null)
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/website-ai/imports/${jobId}?tenantId=${encodeURIComponent(tenantId)}`
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load job')
      setJob(json.job)
      setSuggestions(json.suggestions ?? [])
      // Auto-select all pending suggestions
      const pendingIds = (json.suggestions ?? [])
        .filter((s: AiSuggestion) => s.status === 'pending' && s.action !== 'ignore')
        .map((s: AiSuggestion) => s.id)
      setSelected(new Set(pendingIds))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [jobId, tenantId])

  useEffect(() => {
    load()
  }, [load])

  function toggleSelection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleUpdate(id: string, updates: Record<string, unknown>) {
    const res = await fetch(
      `/api/website-ai/suggestions/${id}?tenantId=${encodeURIComponent(tenantId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }
    )
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Update failed')
    setSuggestions((prev) => prev.map((s) => (s.id === id ? { ...s, ...json.suggestion } : s)))
  }

  async function handleReject(id: string) {
    await handleUpdate(id, { status: 'rejected' })
    setSelected((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
  }

  async function handleApply(publishMode: 'draft_only' | 'publish_now') {
    if (selected.size === 0) return
    setApplying(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/website-ai/imports/${jobId}/apply?tenantId=${encodeURIComponent(tenantId)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggestionIds: Array.from(selected), publishMode }),
        }
      )
      const json = await res.json()
      if (!res.ok) {
        if (typeof json.applied === 'number' && json.applied > 0) {
          setToast(
            `${json.applied} section${json.applied !== 1 ? 's were' : ' was'} saved to your draft.`
          )
          await load()
        }
        throw new Error(json.error ?? 'Apply failed')
      }
      const partialWarning =
        Array.isArray(json.errors) && json.errors.length > 0
          ? ' Some finishing steps need your attention.'
          : ''
      const msg = `${json.applied} suggestion${json.applied !== 1 ? 's' : ''} applied${json.published ? ' and published' : ' to your draft'}.${partialWarning}`
      setToast(msg)
      setTimeout(() => setToast(null), 5000)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Apply failed')
    } finally {
      setApplying(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-graphite-800/50 border border-white/5" />
        ))}
      </div>
    )
  }

  if (!job) {
    return <div className="text-center py-12 text-white/40 text-sm">Job not found.</div>
  }

  const warnings: string[] = ((job.metadata as Record<string, unknown>)?.warnings as string[]) ?? []
  const questions: string[] =
    ((job.metadata as Record<string, unknown>)?.missingInfoQuestions as string[]) ?? []
  const activeSuggestions = suggestions.filter((s) => s.status !== 'rejected')
  const actionableSuggestions = activeSuggestions.filter(
    (s) => s.status !== 'applied' && s.action !== 'ignore'
  )
  const jobComplete =
    suggestions.length > 0 &&
    suggestions.every((s) => s.status === 'applied' || s.status === 'rejected')
  const selectedCount = Array.from(selected).filter((id) => {
    const s = suggestions.find((sg) => sg.id === id)
    return s && s.action !== 'ignore' && s.status !== 'rejected' && s.status !== 'applied'
  }).length

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <p className="text-sm text-emerald-400">{toast}</p>
            <Link
              href="/website"
              className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-white hover:text-gold-300"
            >
              Open builder
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <button onClick={() => setToast(null)}>
            <X className="h-4 w-4 text-emerald-400/50" />
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Job summary */}
      <div className="rounded-2xl bg-graphite-800/60 border border-surface-border p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-white mb-0.5">
              {job.summary ?? 'Analysis complete'}
            </p>
            <p className="text-xs text-white/40">
              {job.detected_business_type && job.detected_business_type !== 'unknown'
                ? `Detected: ${job.detected_business_type.replace(/_/g, ' ')}`
                : 'Business type: unknown'}
            </p>
          </div>
          {job.confidence !== null && <ConfidenceBadge confidence={job.confidence} size="md" />}
        </div>
        {job.detected_content_types?.length > 0 && (
          <DetectedContentChips types={job.detected_content_types} />
        )}
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="rounded-xl bg-gold-500/8 border border-gold-500/15 px-4 py-3 space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-gold-400" />
            <p className="text-xs font-semibold text-gold-400">Warnings</p>
          </div>
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-gold-400/70">
              • {w}
            </p>
          ))}
        </div>
      )}

      {/* Missing info */}
      {questions.length > 0 && (
        <div className="rounded-xl bg-blue-500/8 border border-blue-500/15 px-4 py-3 space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <HelpCircle className="h-4 w-4 text-blue-400" />
            <p className="text-xs font-semibold text-blue-400">Consider adding</p>
          </div>
          {questions.map((q, i) => (
            <p key={i} className="text-xs text-blue-400/70">
              • {q}
            </p>
          ))}
        </div>
      )}

      {jobComplete && (
        <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-4 py-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCheck className="h-5 w-5" />
            <p className="text-sm font-medium">Your website content is ready.</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/website" className="font-semibold text-gold-400 hover:text-gold-300">
              Open website builder
            </Link>
            <button type="button" onClick={onDone} className="text-white/40 hover:text-white/70">
              Create another draft
            </button>
          </div>
        </div>
      )}

      {/* Select/deselect all */}
      {actionableSuggestions.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/40">
            {actionableSuggestions.length} suggestion
            {actionableSuggestions.length !== 1 ? 's' : ''}
            {selectedCount > 0 && ` · ${selectedCount} selected`}
          </p>
          <button
            onClick={() => {
              const ids = actionableSuggestions.map((s) => s.id)
              const allSelected = ids.every((id) => selected.has(id))
              setSelected(allSelected ? new Set() : new Set(ids))
            }}
            className="text-xs text-gold-400 hover:text-gold-300 transition-colors"
          >
            {actionableSuggestions.every((s) => selected.has(s.id)) ? 'Deselect all' : 'Select all'}
          </button>
        </div>
      )}

      {/* Keep the completion action visible before the user reviews a long section list. */}
      <ApplySuggestionsBar
        selectedCount={selectedCount}
        applying={applying}
        onApplyDraft={() => handleApply('draft_only')}
        onApplyPublish={() => handleApply('publish_now')}
        onCancel={() => setSelected(new Set())}
      />

      {/* Suggestion cards */}
      {activeSuggestions.length > 0 ? (
        <motion.div
          variants={staggerContainer(0.04)}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {activeSuggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.id}
              suggestion={suggestion}
              selected={selected.has(suggestion.id)}
              onToggle={toggleSelection}
              onUpdate={handleUpdate}
              onReject={handleReject}
            />
          ))}
        </motion.div>
      ) : (
        <div className="flex items-center justify-center gap-2 py-8 text-white/30">
          <CheckCheck className="h-5 w-5" />
          <p className="text-sm">No active website suggestions remain.</p>
        </div>
      )}
    </div>
  )
}
