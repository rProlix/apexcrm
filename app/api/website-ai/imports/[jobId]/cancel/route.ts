// app/api/website-ai/imports/[jobId]/cancel/route.ts
// POST /api/website-ai/imports/[jobId]/cancel

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { requireAiAutofillAccess, verifyJobAccess } from '@/lib/website-ai/tenantAccess'

type Params = { params: Promise<{ jobId: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { jobId } = await params

  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const access = await requireAiAutofillAccess()
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tenantId } = access

  if (!(await verifyJobAccess(jobId, tenantId))) {
    return NextResponse.json({ error: 'This import does not belong to your business.' }, { status: 403 })
  }

  const db = getSupabaseServerClient()

  const { data: job } = await db
    .from('website_ai_import_jobs')
    .select('status')
    .eq('id', jobId)
    .single()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  if (job.status === 'applied') {
    return NextResponse.json({ error: 'Applied jobs cannot be cancelled.' }, { status: 409 })
  }

  if (job.status === 'cancelled') {
    return NextResponse.json({ message: 'Job already cancelled' })
  }

  await db
    .from('website_ai_import_jobs')
    .update({ status: 'cancelled' })
    .eq('id', jobId)
    .eq('tenant_id', tenantId)

  return NextResponse.json({ cancelled: true })
}
