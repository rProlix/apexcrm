'use client'
// components/website-ai/AiAutofillClient.tsx
// Main client component for the AI Website Autofill feature.
// Rendered by app/(dashboard)/website/ai-autofill/page.tsx

import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, History, RefreshCw } from 'lucide-react'
import { fadeIn, staggerContainer } from '@/lib/motion'
import { cn } from '@/lib/utils'
import { AiAutofillSecurityNotice } from './AiAutofillSecurityNotice'
import { PasteDetailsPanel } from './PasteDetailsPanel'
import { ImportJobList } from './ImportJobList'
import { ImportJobDetail } from './ImportJobDetail'
import { AiAutofillEmptyState } from './AiAutofillEmptyState'
import type { AiImportJob } from '@/lib/website-ai/types'

interface Props {
  tenantId:    string
  isOwner:     boolean
  initialJobs: Partial<AiImportJob>[]
}

export function AiAutofillClient({ tenantId, isOwner, initialJobs }: Props) {
  const [jobs,        setJobs]        = useState<Partial<AiImportJob>[]>(initialJobs)
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [view,        setView]        = useState<'paste' | 'detail'>('paste')
  const [refreshing,  setRefreshing]  = useState(false)

  const refreshJobs = useCallback(async () => {
    setRefreshing(true)
    try {
      const res  = await fetch(`/api/website-ai/imports?tenantId=${tenantId}`)
      const json = await res.json()
      if (res.ok) setJobs(json.jobs ?? [])
    } finally {
      setRefreshing(false)
    }
  }, [tenantId])

  function handleAnalyzed(jobId: string) {
    setSelectedJob(jobId)
    setView('detail')
    void refreshJobs()
  }

  function handleSelectJob(jobId: string) {
    setSelectedJob(jobId)
    setView('detail')
  }

  function handleBack() {
    setSelectedJob(null)
    setView('paste')
    void refreshJobs()
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="h-5 w-5 text-violet-400" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">AI Website Autofill</h1>
            <p className="text-sm text-white/40 mt-0.5">
              Paste raw business details — Gemini structures them into website content.
            </p>
          </div>
        </div>

        {view === 'detail' && (
          <button
            onClick={handleBack}
            className="text-sm text-white/40 hover:text-white/70 transition-colors flex items-center gap-1.5 mt-1"
          >
            ← Back to paste
          </button>
        )}
      </div>

      <AiAutofillSecurityNotice />

      {/* Main layout: content (2/3) + history sidebar (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Left — paste panel or job detail */}
        <div className="lg:col-span-2 space-y-6">
          {view === 'paste' ? (
            <>
              <PasteDetailsPanel
                tenantId={tenantId}
                isOwner={isOwner}
                onAnalyzed={handleAnalyzed}
              />
              {jobs.length === 0 && !refreshing && (
                <AiAutofillEmptyState />
              )}
            </>
          ) : selectedJob ? (
            <ImportJobDetail jobId={selectedJob} onDone={handleBack} />
          ) : null}
        </div>

        {/* Right — job history */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-white/30" />
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-widest">
                History
              </h2>
            </div>
            <button
              onClick={refreshJobs}
              disabled={refreshing}
              className="text-white/25 hover:text-white/60 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
            </button>
          </div>

          <ImportJobList
            jobs={jobs}
            selected={selectedJob}
            onSelect={handleSelectJob}
          />

          {jobs.length === 0 && !refreshing && (
            <p className="text-2xs text-white/25 text-center py-4">
              No analyses yet. Paste something to get started.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}
