// app/api/website-ai/imports/[jobId]/route.ts
// GET    /api/website-ai/imports/[jobId]  — get job with suggestions
// DELETE /api/website-ai/imports/[jobId]  — archive/cancel job

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess, verifyJobAccess } from '@/lib/website-ai/tenantAccess'

function forbidden(msg = 'Forbidden') {
  return NextResponse.json({ error: msg }, { status: 403 })
}

type Params = { params: Promise<{ jobId: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { jobId } = await params

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden()

  const access = await requireAiAutofillAccess()
  if (!access) return forbidden('You do not have permission to use AI Autofill for this website.')

  const { tenantId } = access

  if (!(await verifyJobAccess(jobId, tenantId))) {
    return NextResponse.json({ error: 'This import does not belong to your business.' }, { status: 403 })
  }

  const db = getSupabaseServerClient()

  const [jobResult, suggestionsResult, changesResult] = await Promise.all([
    db.from('website_ai_import_jobs').select('*').eq('id', jobId).single(),
    db.from('website_ai_suggestions').select('*').eq('job_id', jobId).eq('tenant_id', tenantId).order('created_at'),
    db.from('website_ai_applied_changes').select('*').eq('job_id', jobId).eq('tenant_id', tenantId).order('created_at'),
  ])

  if (jobResult.error || !jobResult.data) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({
    job:         jobResult.data,
    suggestions: suggestionsResult.data ?? [],
    changes:     changesResult.data ?? [],
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { jobId } = await params

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) return forbidden()

  const access = await requireAiAutofillAccess()
  if (!access) return forbidden()

  const { tenantId } = access

  if (!(await verifyJobAccess(jobId, tenantId))) {
    return NextResponse.json({ error: 'This import does not belong to your business.' }, { status: 403 })
  }

  const db = getSupabaseServerClient()

  // Check if already applied
  const { data: job } = await db
    .from('website_ai_import_jobs')
    .select('status')
    .eq('id', jobId)
    .single()

  if (job?.status === 'applied') {
    // Prefer cancellation over hard-delete for applied jobs
    await db
      .from('website_ai_import_jobs')
      .update({ status: 'cancelled' })
      .eq('id', jobId)
      .eq('tenant_id', tenantId)

    return NextResponse.json({ deleted: false, archived: true })
  }

  const { error } = await db
    .from('website_ai_import_jobs')
    .delete()
    .eq('id', jobId)
    .eq('tenant_id', tenantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ deleted: true })
}
