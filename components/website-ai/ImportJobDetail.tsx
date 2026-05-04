'use client'
// components/website-ai/ImportJobDetail.tsx
// Full detail view of a selected import job.

import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { staggerContainer } from '@/lib/motion'
import { AlertTriangle, HelpCircle, CheckCheck, X } from 'lucide-react'
import { ConfidenceBadge } from './ConfidenceBadge'
import { DetectedContentChips } from './DetectedContentChips'
import { SuggestionCard } from './SuggestionCard'
import { ApplySuggestionsBar } from './ApplySuggestionsBar'
import type { AiImportJob, AiSuggestion } from '@/lib/website-ai/types'

interface Props {
  jobId:  string
  onDone: () => void
}

export function ImportJobDetail({ jobId, onDone }: Props) {
  const [job,          setJob]         = useState<AiImportJob | null>(null)
  const [suggestions,  setSuggestions] = useState<AiSuggestion[]>([])
  const [selected,     setSelected]    = useState<Set<string>>(new Set())
  const [applying,     setApplying]    = useState(false)
  const [error,        setError]       = useState<string | null>(null)
  const [toast,        setToast]       = useState<string | null>(null)
  const [loading,      setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/website-ai/imports/${jobId}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load job')
      setJob(json.job)
      setSuggestions(json.suggestions ?? [])
      // Auto-select all pending suggestions
      const pendingIds = (json.suggestions ?? [])
        .filter((s: AiSuggestion) => s.status === 'pending')
        .map((s: AiSuggestion) => s.id)
      setSelected(new Set(pendingIds))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [jobId])

  useEffect(() => { load() }, [load])

  function toggleSelection(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleUpdate(id: string, updates: Record<string, string>) {
    const res  = await fetch(`/api/website-ai/suggestions/${id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(updates),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? 'Update failed')
    setSuggestions((prev) => prev.map((s) => s.id === id ? { ...s, ...json.suggestion } : s))
  }

  async function handleReject(id: string) {
    await handleUpdate(id, { status: 'rejected' })
    setSelected((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  async function handleApply(publishMode: 'draft_only' | 'publish_now') {
    if (selected.size === 0) return
    setApplying(true)
    setError(null)
    try {
      const res  = await fetch(`/api/website-ai/imports/${jobId}/apply`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ suggestionIds: Array.from(selected), publishMode }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Apply failed')
      const msg = `${json.applied} suggestion${json.applied !== 1 ? 's' : ''} applied${json.published ? ' and published' : ' to draft'}.`
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
        {[1,2,3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-graphite-800/50 border border-white/5" />
        ))}
      </div>
    )
  }

  if (!job) {
    return (
      <div className="text-center py-12 text-white/40 text-sm">Job not found.</div>
    )
  }

  const warnings: string[]    = (job.metadata as Record<string, unknown>)?.warnings as string[] ?? []
  const questions: string[]   = (job.metadata as Record<string, unknown>)?.missingInfoQuestions as string[] ?? []
  const activeSuggestions     = suggestions.filter((s) => s.status !== 'rejected')
  const selectedCount         = Array.from(selected).filter((id) => {
    const s = suggestions.find((sg) => sg.id === id)
    return s && s.status !== 'rejected' && s.status !== 'applied'
  }).length

  return (
    <div className="space-y-5">
      {/* Toast */}
      {toast && (
        <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-4 py-3 flex items-center justify-between">
          <p className="text-sm text-emerald-400">{toast}</p>
          <button onClick={() => setToast(null)}><X className="h-4 w-4 text-emerald-400/50" /></button>
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
            <p className="text-sm font-semibold text-white mb-0.5">{job.summary ?? 'Analysis complete'}</p>
            <p className="text-xs text-white/40">
              {job.detected_business_type && job.detected_business_type !== 'unknown'
                ? `Detected: ${job.detected_business_type.replace(/_/g, ' ')}`
                : 'Business type: unknown'}
            </p>
          </div>
          {job.confidence !== null && (
            <ConfidenceBadge confidence={job.confidence} size="md" />
          )}
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
            <p key={i} className="text-xs text-gold-400/70">• {w}</p>
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
            <p key={i} className="text-xs text-blue-400/70">• {q}</p>
          ))}
        </div>
      )}

      {/* Select/deselect all */}
      {activeSuggestions.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-white/40">
            {activeSuggestions.length} suggestion{activeSuggestions.length !== 1 ? 's' : ''}
            {selectedCount > 0 && ` · ${selectedCount} selected`}
          </p>
          <button
            onClick={() => {
              const ids = activeSuggestions.filter((s) => s.status !== 'applied').map((s) => s.id)
              const allSelected = ids.every((id) => selected.has(id))
              setSelected(allSelected ? new Set() : new Set(ids))
            }}
            className="text-xs text-gold-400 hover:text-gold-300 transition-colors"
          >
            {activeSuggestions.filter((s) => s.status !== 'applied').every((s) => selected.has(s.id))
              ? 'Deselect all'
              : 'Select all'}
          </button>
        </div>
      )}

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
        <div className="flex items-center gap-2 justify-center py-8 text-white/30">
          <CheckCheck className="h-5 w-5" />
          <p className="text-sm">All suggestions have been applied or rejected.</p>
        </div>
      )}

      {/* Apply bar */}
      <ApplySuggestionsBar
        selectedCount={selectedCount}
        applying={applying}
        onApplyDraft={()   => handleApply('draft_only')}
        onApplyPublish={()  => handleApply('publish_now')}
        onCancel={() => setSelected(new Set())}
      />
    </div>
  )
}
