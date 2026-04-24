// app/api/website-import/jobs/[id]/approve/route.ts
// Allows owner to approve or reject specific extracted result fields.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

const approveSchema = z.object({
  result_ids: z.array(z.string().uuid()).min(1).max(100),
  approved:   z.boolean(),
  // Optional: owner can edit the value before approving
  overrides:  z.record(z.string(), z.unknown()).optional(),
})

// ── POST /api/website-import/jobs/[id]/approve ────────────────────────────────
// Approve or reject a set of import result rows.
// Optionally override the result_value for a given result_id.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = approveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 422 })
  }

  const { result_ids, approved, overrides } = parsed.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = getSupabaseServerClient() as any
  const jobId = (await params).id

  // Verify job exists
  const { data: job } = await db
    .from('website_import_jobs')
    .select('id, tenant_id, status')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Update each result
  const updates = result_ids.map(async (resultId) => {
    const updatePayload: Record<string, unknown> = {
      approved,
      updated_at: new Date().toISOString(),
    }

    if (overrides?.[resultId] !== undefined) {
      updatePayload.result_value = overrides[resultId]
    }

    return db
      .from('website_import_results')
      .update(updatePayload)
      .eq('id', resultId)
      .eq('job_id', jobId)
  })

  await Promise.all(updates)

  // Audit
  await db.from('website_import_audit').insert({
    tenant_id: job.tenant_id,
    job_id:    jobId,
    action:    approved ? 'results_approved' : 'results_rejected',
    metadata:  { result_ids, count: result_ids.length },
  })

  return NextResponse.json({ success: true, updated: result_ids.length })
}
