'use client'
// components/website-ai/AiAutofillPage.tsx
// Main client component for the AI Autofill feature.

import { useState, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { Wand2, History, ArrowLeft } from 'lucide-react'
import { fadeIn, staggerContainer, fadeUp } from '@/lib/motion'
import { AiAutofillSecurityNotice } from './AiAutofillSecurityNotice'
import { PasteDetailsPanel } from './PasteDetailsPanel'
import { ImportJobList } from './ImportJobList'
import { ImportJobDetail } from './ImportJobDetail'
import { AiAutofillEmptyState } from './AiAutofillEmptyState'
import type { AiImportJob } from '@/lib/website-ai/types'

interface Props {
  tenantId: string
  isOwner:  boolean
  initialJobs: Partial<AiImportJob>[]
}

export function AiAutofillPage({ tenantId, isOwner, initialJobs }: Props) {
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
    refreshJobs()
  }

  function handleSelectJob(jobId: string) {
    setSelectedJob(jobId)
    setView('detail')
  }

  function handleBack() {
    setSelectedJob(null)
    setView('paste')
    refreshJobs()
  }

  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {view === 'detail' && (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-3"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to AI Autofill
            </button>
          )}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gold-500/10 border border-gold-500/20 flex items-center justify-center shrink-0">
              <Wand2 className="h-5 w-5 text-gold-400" strokeWidth={1.75} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">AI Website Autofill</h1>
              <p className="text-sm text-white/40 mt-0.5">
                Paste business details and let Gemini organize them into your website.
              </p>
            </div>
          </div>
        </div>
      </div>

      <AiAutofillSecurityNotice />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: paste or detail */}
        <div className="lg:col-span-2">
          {view === 'paste' ? (
            <>
              <PasteDetailsPanel
                tenantId={tenantId}
                isOwner={isOwner}
                onAnalyzed={handleAnalyzed}
              />
              {jobs.length === 0 && !refreshing && (
                <div className="mt-8">
                  <AiAutofillEmptyState />
                </div>
              )}
            </>
          ) : selectedJob ? (
            <ImportJobDetail
              jobId={selectedJob}
              onDone={handleBack}
            />
          ) : null}
        </div>

        {/* Right: history */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-white/30" />
            <h2 className="text-sm font-semibold text-white/50 uppercase tracking-widest">History</h2>
            {refreshing && (
              <span className="text-2xs text-white/20 animate-pulse">refreshing…</span>
            )}
          </div>
          <ImportJobList
            jobs={jobs}
            selected={selectedJob}
            onSelect={handleSelectJob}
          />
          {jobs.length > 0 && (
            <button
              onClick={refreshJobs}
              className="text-xs text-white/30 hover:text-white/60 transition-colors w-full text-center"
            >
              Refresh
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
