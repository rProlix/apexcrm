'use client'
// components/website-import/ImportJobDetailClient.tsx
// Full review and approval page for a completed import job.
import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, RefreshCw, CheckCircle2, Send, AlertTriangle,
  Layers, Eye, MapPin, Clock,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { fadeUp, staggerContainer } from '@/lib/motion'
import { ImportStatusBadge } from './ImportStatusBadge'
import { ImportProgress } from './ImportProgress'
import { SourceCard } from './SourceCard'
import { ExtractedFieldReview, type ReviewField } from './ExtractedFieldReview'
import { ContentMappingPanel } from './ContentMappingPanel'
import { ImportPreview } from './ImportPreview'

interface ImportResult {
  id:               string
  result_key:       string
  mapped_section:   string | null
  result_value:     unknown
  confidence_score: number
  approved:         boolean
}

interface ImportSource {
  id:               string
  source_url:       string
  source_type:      string
  page_title:       string | null
  fetched_status:   string
  confidence_score: number
  raw_metadata:     Record<string, unknown> | null
}

interface Job {
  id:             string
  tenant_id:      string
  status:         string
  progress:       number
  source_urls:    string[]
  notes:          string | null
  error_message:  string | null
  started_at:     string | null
  completed_at:   string | null
  created_at:     string
  updated_at:     string
  website_import_sources:  ImportSource[]
  website_import_results:  ImportResult[]
  website_import_media:    Array<{ id: string; asset_url: string; asset_type: string | null; alt_text: string | null }>
  website_import_audit:    Array<{ id: string; action: string; metadata: unknown; created_at: string }>
}

interface Props {
  tenantId: string
  job:      Job
}

type Tab = 'review' | 'mapping' | 'preview' | 'sources' | 'audit'

export function ImportJobDetailClient({ tenantId, job: initialJob }: Props) {
  const [job,        setJob]        = useState<Job>(initialJob)
  const [tab,        setTab]        = useState<Tab>('review')
  const [running,    setRunning]    = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [applying,   setApplying]   = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState<string | null>(null)
  const [preview,    setPreview]    = useState<{ settings: Record<string, unknown>; pages: unknown[] } | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  const isCompleted = job.status === 'completed'
  const isRunning   = job.status === 'running' || running
  const results     = job.website_import_results ?? []
  const sources     = job.website_import_sources ?? []

  // ── Refresh ─────────────────────────────────────────────────────────────

  const refreshJob = useCallback(async () => {
    const res = await fetch(`/api/website-import/jobs/${job.id}`)
    if (!res.ok) return
    const json = await res.json()
    if (json.job) setJob(json.job)
  }, [job.id])

  // ── Re-run import ────────────────────────────────────────────────────────

  async function handleRerun() {
    setRunning(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/website-import/jobs/${job.id}/run`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')
      await refreshJob()
      setSuccess('Import completed successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setRunning(false)
    }
  }

  // ── Approve fields ────────────────────────────────────────────────────────

  async function handleApprove(
    ids:       string[],
    approved:  boolean,
    overrides?: Record<string, unknown>,
  ) {
    const res = await fetch(`/api/website-import/jobs/${job.id}/approve`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ result_ids: ids, approved, overrides }),
    })
    if (!res.ok) return
    await refreshJob()
  }

  // ── Apply to site (no publish) ────────────────────────────────────────────

  async function handleApply() {
    setApplying(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/website-import/jobs/${job.id}/publish`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ apply_only: true, auto_publish: false }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setSuccess(`Applied ${json.applied} approved field(s) to your draft site.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setApplying(false)
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async function handlePublish() {
    const confirmOk = window.confirm(
      'This will publish your website publicly. Are you sure?',
    )
    if (!confirmOk) return

    setPublishing(true)
    setError(null)
    setSuccess(null)
    try {
      const res = await fetch(`/api/website-import/jobs/${job.id}/publish`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ apply_only: false, auto_publish: true }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed')
      setSuccess('Site published successfully!')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPublishing(false)
    }
  }

  // ── Load preview ──────────────────────────────────────────────────────────

  async function loadPreview() {
    setTab('preview')
    if (preview) return
    setPreviewLoading(true)
    try {
      const res = await fetch(`/api/website-import/preview?job_id=${job.id}`)
      if (!res.ok) return
      const json = await res.json()
      setPreview(json.preview)
    } finally {
      setPreviewLoading(false)
    }
  }

  const approvedCount  = results.filter((r) => r.approved).length
  const lowConfResults = results.filter((r) => r.confidence_score < 0.50 && !r.approved)

  const reviewFields: ReviewField[] = results.map((r) => ({
    id:               r.id,
    result_key:       r.result_key,
    mapped_section:   r.mapped_section,
    result_value:     r.result_value,
    confidence_score: r.confidence_score,
    approved:         r.approved,
  }))

  const TABS: Array<{ id: Tab; label: string; count?: number }> = [
    { id: 'review',  label: 'Review Fields',  count: results.length },
    { id: 'mapping', label: 'Content Map' },
    { id: 'preview', label: 'Site Preview' },
    { id: 'sources', label: 'Sources',        count: sources.length },
    { id: 'audit',   label: 'Audit Log',      count: job.website_import_audit?.length },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-8 p-6 lg:p-8">
      {/* Header */}
      <motion.div variants={staggerContainer()} initial="hidden" animate="visible" className="space-y-4">
        <motion.div variants={fadeUp} className="flex items-center gap-2">
          <Link
            href="/website/import"
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <ArrowLeft size={12} />
            Back to Imports
          </Link>
        </motion.div>

        <motion.div variants={fadeUp} className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Import Review</h1>
            <p className="text-xs text-white/30 mt-1 font-mono">{job.id}</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <ImportStatusBadge status={job.status as 'queued' | 'running' | 'completed' | 'failed' | 'canceled'} size="md" />

            {(job.status === 'completed' || job.status === 'failed') && (
              <button
                onClick={handleRerun}
                disabled={running}
                className="flex items-center gap-1.5 text-sm text-white/40 hover:text-amber-300/70 border border-white/10 hover:border-amber-400/30 rounded-xl px-3 py-2 transition-all disabled:opacity-40"
              >
                <RefreshCw size={13} className={cn(running && 'animate-spin')} />
                Re-run Import
              </button>
            )}

            {isCompleted && approvedCount > 0 && (
              <>
                <button
                  onClick={handleApply}
                  disabled={applying || publishing}
                  className="flex items-center gap-1.5 text-sm font-medium text-amber-300 border border-amber-400/30 bg-amber-400/10 hover:bg-amber-400/15 rounded-xl px-3 py-2 transition-all disabled:opacity-40"
                >
                  <Layers size={13} />
                  {applying ? 'Applying…' : `Apply ${approvedCount} Field${approvedCount !== 1 ? 's' : ''} to Draft`}
                </button>

                <button
                  onClick={handlePublish}
                  disabled={publishing || applying}
                  className={cn(
                    'flex items-center gap-1.5 text-sm font-semibold rounded-xl px-4 py-2 transition-all',
                    'bg-gradient-to-r from-amber-500 to-amber-400 text-black',
                    'hover:from-amber-400 hover:to-amber-300 hover:shadow-lg hover:shadow-amber-400/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                >
                  <Send size={13} />
                  {publishing ? 'Publishing…' : 'Publish Site'}
                </button>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Progress (if running) */}
      {isRunning && (
        <motion.div variants={fadeUp} initial="hidden" animate="visible"
          className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
        >
          <ImportProgress
            status="running"
            progress={job.progress}
            sources={sources}
          />
        </motion.div>
      )}

      {/* Status messages */}
      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-400/20 bg-red-400/5 px-4 py-3 text-sm text-red-300">
          <AlertTriangle size={14} className="flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-4 py-3 text-sm text-emerald-300">
          <CheckCircle2 size={14} className="flex-shrink-0" />
          {success}
          {success.includes('draft') && (
            <Link href="/website" className="ml-2 underline hover:no-underline">
              Open Website Builder →
            </Link>
          )}
        </div>
      )}

      {/* Low confidence warning */}
      {isCompleted && lowConfResults.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-sm text-amber-300/80">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            {lowConfResults.length} field{lowConfResults.length !== 1 ? 's' : ''} have low confidence scores.
            Review them carefully before approving.
          </span>
        </div>
      )}

      {/* Job meta info */}
      {job.notes && (
        <p className="text-sm text-white/40 italic border-l-2 border-white/10 pl-3">
          {job.notes}
        </p>
      )}

      {/* Tabs */}
      <div className="border-b border-white/10">
        <div className="flex gap-1 -mb-px overflow-x-auto">
          {TABS.map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => id === 'preview' ? loadPreview() : setTab(id)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                tab === id
                  ? 'border-amber-400 text-amber-300'
                  : 'border-transparent text-white/30 hover:text-white/60 hover:border-white/20',
              )}
            >
              {label}
              {count != null && count > 0 && (
                <span className={cn(
                  'text-[10px] rounded-full px-1.5 py-0.5 font-medium',
                  tab === id ? 'bg-amber-400/20 text-amber-300' : 'bg-white/8 text-white/30',
                )}>
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab panels */}
      <div className="min-h-[300px]">
        {/* Review */}
        {tab === 'review' && (
          <motion.div key="review" variants={fadeUp} initial="hidden" animate="visible">
            {results.length > 0 ? (
              <ExtractedFieldReview
                fields={reviewFields}
                onApprove={handleApprove}
                disabled={!isCompleted}
              />
            ) : (
              <EmptyTabState
                icon={<Layers size={28} />}
                message={isCompleted
                  ? 'No extracted fields found for this job.'
                  : 'Run the import to extract business fields.'}
              />
            )}
          </motion.div>
        )}

        {/* Mapping */}
        {tab === 'mapping' && (
          <motion.div key="mapping" variants={fadeUp} initial="hidden" animate="visible">
            {results.length > 0 ? (
              <ContentMappingPanel results={results} />
            ) : (
              <EmptyTabState icon={<MapPin size={28} />} message="Run the import to see content mappings." />
            )}
          </motion.div>
        )}

        {/* Preview */}
        {tab === 'preview' && (
          <motion.div key="preview" variants={fadeUp} initial="hidden" animate="visible">
            <ImportPreview
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              preview={preview as any}
              loading={previewLoading}
            />
          </motion.div>
        )}

        {/* Sources */}
        {tab === 'sources' && (
          <motion.div key="sources" variants={fadeUp} initial="hidden" animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 gap-3"
          >
            {sources.map((src) => (
              <SourceCard key={src.id} source={src} />
            ))}
          </motion.div>
        )}

        {/* Audit */}
        {tab === 'audit' && (
          <motion.div key="audit" variants={fadeUp} initial="hidden" animate="visible"
            className="space-y-2"
          >
            {(job.website_import_audit ?? []).map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 py-3 border-b border-white/5">
                <Clock size={12} className="text-white/20 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/60 font-medium">{entry.action.replace(/_/g, ' ')}</p>
                  {!!entry.metadata && Object.keys(entry.metadata as Record<string, unknown>).length > 0 && (
                    <pre className="text-xs text-white/25 font-mono mt-0.5 whitespace-pre-wrap">
                      {JSON.stringify(entry.metadata, null, 2).slice(0, 300)}
                    </pre>
                  )}
                </div>
                <span className="text-xs text-white/20 flex-shrink-0 whitespace-nowrap">
                  {new Date(entry.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
            {(job.website_import_audit ?? []).length === 0 && (
              <EmptyTabState icon={<Clock size={28} />} message="No audit events yet." />
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}

function EmptyTabState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-12 text-center">
      <div className="flex justify-center text-white/15 mb-3">{icon}</div>
      <p className="text-sm text-white/30">{message}</p>
    </div>
  )
}
