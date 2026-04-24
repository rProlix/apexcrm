// app/api/website-import/jobs/[id]/run/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { runImportJob } from '@/lib/website-import/runImportJob'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── POST /api/website-import/jobs/[id]/run ────────────────────────────────────
// Triggers the import pipeline for an existing job.
// The job must belong to the owner's tenant.
// Long-running: responds immediately with job status,
// pipeline runs in the request context (suitable for Vercel functions ≤ 60s).
// For very large jobs, consider offloading to a background worker.

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const db = getSupabaseServerClient()
  const jobId = params.id

  // Verify job belongs to owner's tenant
  const { data: job } = await db
    .from('website_import_jobs')
    .select('id, tenant_id, status')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'running') {
    return NextResponse.json({ error: 'Job is already running' }, { status: 409 })
  }

  // Reset job for re-run if previously completed/failed
  if (job.status === 'completed' || job.status === 'failed') {
    await db
      .from('website_import_jobs')
      .update({
        status:        'queued',
        progress:      0,
        error_message: null,
        started_at:    null,
        completed_at:  null,
      })
      .eq('id', jobId)

    // Reset source statuses
    await db
      .from('website_import_sources')
      .update({ fetched_status: 'pending', confidence_score: 0 })
      .eq('job_id', jobId)
  }

  // Run the pipeline synchronously in this request
  const result = await runImportJob(jobId, job.tenant_id)

  if (!result.success) {
    return NextResponse.json(
      { error: result.error ?? 'Import pipeline failed' },
      { status: 500 },
    )
  }

  // Return updated job state
  const { data: updatedJob } = await db
    .from('website_import_jobs')
    .select(`
      *,
      website_import_sources(*),
      website_import_results(id, result_key, mapped_section, confidence_score, approved)
    `)
    .eq('id', jobId)
    .single()

  return NextResponse.json({ success: true, job: updatedJob })
}
