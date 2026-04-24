// app/api/website-import/jobs/[id]/cancel/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── POST /api/website-import/jobs/[id]/cancel ─────────────────────────────────
// Cancels a queued or running job.

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const db = getSupabaseServerClient()
  const jobId = params.id

  const { data: job } = await db
    .from('website_import_jobs')
    .select('id, tenant_id, status')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'completed') {
    return NextResponse.json({ error: 'Completed jobs cannot be canceled' }, { status: 409 })
  }

  const { error } = await db
    .from('website_import_jobs')
    .update({
      status:       'canceled',
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('website_import_audit').insert({
    tenant_id: job.tenant_id,
    job_id:    jobId,
    action:    'job_canceled',
    metadata:  {},
  })

  return NextResponse.json({ success: true })
}
