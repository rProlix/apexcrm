'use client'
// components/website-import/WebsiteImportClient.tsx
// Main client for /website/import — URL entry, job list, and real-time progress.
import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { Download, RefreshCw, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { fadeUp, staggerContainer } from '@/lib/motion'
import { ImportUrlForm } from './ImportUrlForm'
import { ImportProgress } from './ImportProgress'
import { ImportJobList, type JobListItem } from './ImportJobList'
import { ImportStatusBadge } from './ImportStatusBadge'

interface Props {
  tenantId:    string
  initialJobs: JobListItem[]
}

const POLL_INTERVAL_MS = 2_500

export function WebsiteImportClient({ tenantId, initialJobs }: Props) {
  const [jobs,       setJobs]       = useState<JobListItem[]>(initialJobs)
  const [activeJob,  setActiveJob]  = useState<JobListItem | null>(null)
  const [running,    setRunning]    = useState(false)
  const [runError,   setRunError]   = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Polling for running jobs ────────────────────────────────────────────

  const refreshJobs = useCallback(async () => {
    const res = await fetch(`/api/website-import/jobs?tenant_id=${tenantId}`)
    if (!res.ok) return
    const json = await res.json()
    const updated: JobListItem[] = json.jobs ?? []
    setJobs(updated)

    // Sync activeJob
    if (activeJob) {
      const refreshed = updated.find((j) => j.id === activeJob.id)
      if (refreshed) setActiveJob(refreshed)
    }

    // Stop polling if no running jobs
    const hasRunning = updated.some((j) => j.status === 'running')
    if (!hasRunning && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [tenantId, activeJob])

  useEffect(() => {
    const hasRunning = jobs.some((j) => j.status === 'running')
    if (hasRunning && !pollRef.current) {
      pollRef.current = setInterval(refreshJobs, POLL_INTERVAL_MS)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [jobs, refreshJobs])

  // ── Handlers ───────────────────────────────────────────────────────────

  async function handleJobCreated(job: { id: string }) {
    await refreshJobs()
    const created = jobs.find((j) => j.id === job.id) ?? { id: job.id } as JobListItem
    setActiveJob(created as JobListItem)

    // Auto-run the job
    setRunning(true)
    setRunError(null)
    try {
      const res = await fetch(`/api/website-import/jobs/${job.id}/run`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')
      await refreshJobs()
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setRunning(false)
      pollRef.current && clearInterval(pollRef.current)
      pollRef.current = null
      await refreshJobs()
    }
  }

  async function handleRerun(jobId: string) {
    setRunning(true)
    setRunError(null)
    try {
      const res = await fetch(`/api/website-import/jobs/${jobId}/run`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Import failed')
      await refreshJobs()
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Import failed')
    } finally {
      setRunning(false)
      await refreshJobs()
    }
  }

  async function handleCancel(jobId: string) {
    await fetch(`/api/website-import/jobs/${jobId}/cancel`, { method: 'POST' })
    await refreshJobs()
  }

  const showProgress = activeJob && (activeJob.status === 'running' || running)
  const activeCompleted = activeJob?.status === 'completed'

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-6 lg:p-8">
      {/* Page header */}
      <motion.div
        variants={staggerContainer()}
        initial="hidden"
        animate="visible"
        className="space-y-1"
      >
        <motion.div variants={fadeUp} className="flex items-center gap-2 mb-2">
          <Link
            href="/website"
            className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
          >
            <ArrowLeft size={12} />
            Website Builder
          </Link>
        </motion.div>

        <motion.div variants={fadeUp} className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
              <Download size={22} className="text-amber-400/80" />
              Website Importer
            </h1>
            <p className="text-sm text-white/40 mt-0.5">
              Paste your business URL(s) to automatically bootstrap your website.
            </p>
          </div>
        </motion.div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: URL form + active job progress */}
        <div className="lg:col-span-3 space-y-6">
          {/* URL form */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-white/70">Import from URLs</h2>
                <p className="text-xs text-white/35 mt-0.5">
                  Add your main website, Yelp page, or other business profiles.
                </p>
              </div>
              <ImportUrlForm
                tenantId={tenantId}
                onJobCreated={handleJobCreated}
                disabled={running}
              />
            </div>
          </motion.div>

          {/* Active job progress */}
          {activeJob && (
            <motion.div
              key={activeJob.id}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 space-y-4"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white/70">Current Import</h2>
                  <p className="text-xs text-white/30 mt-0.5 font-mono">{activeJob.id.slice(0, 12)}…</p>
                </div>
                <div className="flex items-center gap-2">
                  <ImportStatusBadge status={activeJob.status} />
                  {(activeJob.status === 'failed' || activeJob.status === 'completed') && (
                    <button
                      onClick={() => handleRerun(activeJob.id)}
                      disabled={running}
                      className="flex items-center gap-1.5 text-xs text-white/30 hover:text-amber-300/70 transition-colors disabled:opacity-40"
                    >
                      <RefreshCw size={12} />
                      Re-run
                    </button>
                  )}
                  {activeJob.status === 'running' && (
                    <button
                      onClick={() => handleCancel(activeJob.id)}
                      className="text-xs text-white/25 hover:text-red-400/60 transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>

              <ImportProgress
                status={running ? 'running' : activeJob.status}
                progress={running ? Math.max(5, activeJob.progress) : activeJob.progress}
                message={runError ?? activeJob.error_message ?? undefined}
                sources={activeJob.website_import_sources}
              />

              {runError && (
                <p className="text-xs text-red-400/70 rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2">
                  {runError}
                </p>
              )}

              {/* CTA after completion */}
              {activeCompleted && (
                <Link
                  href={`/website/import/${activeJob.id}`}
                  className={cn(
                    'block w-full text-center rounded-xl py-2.5 text-sm font-semibold transition-all duration-200',
                    'bg-gradient-to-r from-amber-500 to-amber-400 text-black',
                    'hover:from-amber-400 hover:to-amber-300 hover:shadow-lg hover:shadow-amber-400/20',
                  )}
                >
                  Review &amp; Approve Imported Content →
                </Link>
              )}
            </motion.div>
          )}
        </div>

        {/* Right: Job history */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-white/50">Import History</h2>
            <button
              onClick={refreshJobs}
              className="text-white/20 hover:text-white/50 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={13} />
            </button>
          </div>

          <ImportJobList
            jobs={jobs}
            activeJobId={activeJob?.id}
            onSelect={setActiveJob}
          />
        </div>
      </div>
    </div>
  )
}
