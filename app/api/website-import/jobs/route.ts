// app/api/website-import/jobs/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { createImportJob } from '@/lib/website-import/createImportJob'
import { validateImportUrl } from '@/lib/website-import/fetchSource'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

const createJobSchema = z.object({
  tenant_id:   z.string().uuid(),
  source_urls: z.array(z.string().url()).min(1).max(10),
  notes:       z.string().max(1000).optional(),
})

// ── GET /api/website-import/jobs ─────────────────────────────────────────────
// Returns all import jobs for the tenant (owner only).

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const tenantId = req.nextUrl.searchParams.get('tenant_id') ?? ctx.tenant_id
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const db = getSupabaseServerClient()

  const { data, error } = await db
    .from('website_import_jobs')
    .select(`
      id, tenant_id, status, progress, source_urls, notes,
      target_site_id, error_message, started_at, completed_at,
      created_at, updated_at,
      website_import_sources(id, source_url, source_type, fetched_status, confidence_score, page_title)
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ jobs: data ?? [] })
}

// ── POST /api/website-import/jobs ─────────────────────────────────────────────
// Create a new import job (owner only).

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })

  const parsed = createJobSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 422 },
    )
  }

  const { tenant_id, source_urls, notes } = parsed.data

  // Validate each URL for SSRF safety
  const urlErrors: string[] = []
  for (const url of source_urls) {
    const err = validateImportUrl(url)
    if (err) urlErrors.push(`${url}: ${err}`)
  }
  if (urlErrors.length > 0) {
    return NextResponse.json(
      { error: 'Invalid URLs detected', details: urlErrors },
      { status: 422 },
    )
  }

  try {
    const { job, sources } = await createImportJob({
      tenantId:   tenant_id,
      createdBy:  ctx.id,
      sourceUrls: source_urls,
      notes,
    })

    return NextResponse.json({ job, sources }, { status: 201 })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create job'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
