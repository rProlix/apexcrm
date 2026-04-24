// app/api/website-import/jobs/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── GET /api/website-import/jobs/[id] ────────────────────────────────────────
// Returns full job details including sources and results.

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const db = getSupabaseServerClient()
  const jobId = params.id

  const { data: job, error } = await db
    .from('website_import_jobs')
    .select(`
      *,
      website_import_sources(*),
      website_import_results(*),
      website_import_media(*),
      website_import_audit(id, action, metadata, created_at)
    `)
    .eq('id', jobId)
    .single()

  if (error || !job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({ job })
}

// ── DELETE /api/website-import/jobs/[id] ─────────────────────────────────────
// Soft-delete / hard delete a job and its related data.

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const db = getSupabaseServerClient()

  const { error } = await db
    .from('website_import_jobs')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
