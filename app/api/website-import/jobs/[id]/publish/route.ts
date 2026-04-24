// app/api/website-import/jobs/[id]/publish/route.ts
// Applies all APPROVED import results to the live site and optionally publishes.
// Only the owner can do this. Never auto-publishes — requires explicit confirmation.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

const publishSchema = z.object({
  // If true, also sets site_settings.is_published = true after applying
  auto_publish: z.boolean().default(false),
  // If true, only applies approved results without publishing
  apply_only:   z.boolean().default(false),
})

// ── POST /api/website-import/jobs/[id]/publish ────────────────────────────────
// Takes all approved import results and applies them to the live website builder.
// Optionally publishes the site after applying.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const body = await req.json().catch(() => ({}))
  const parsed = publishSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed' }, { status: 422 })
  }

  const { auto_publish, apply_only } = parsed.data
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = getSupabaseServerClient() as any
  const jobId = (await params).id

  // Verify job
  const { data: job } = await db
    .from('website_import_jobs')
    .select('id, tenant_id, status, target_site_id')
    .eq('id', jobId)
    .maybeSingle()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if (job.status !== 'completed') {
    return NextResponse.json({ error: 'Job must be completed before publishing' }, { status: 409 })
  }

  const tenantId = job.tenant_id

  // Load approved results
  const { data: results } = await db
    .from('website_import_results')
    .select('result_key, result_value, mapped_section')
    .eq('job_id', jobId)
    .eq('approved', true)

  if (!results?.length) {
    return NextResponse.json({ error: 'No approved results to apply. Approve fields first.' }, { status: 400 })
  }

  // Apply approved results to site_settings
  const settingsUpdates: Record<string, unknown> = {}
  for (const result of results) {
    switch (result.result_key) {
      case 'businessName':   settingsUpdates.site_name   = result.result_value; break
      case 'logoUrl':        settingsUpdates.logo_url    = result.result_value; break
      case 'faviconUrl':     settingsUpdates.favicon_url = result.result_value; break
      case 'brandColors':    settingsUpdates.brand_colors = result.result_value; break
      case 'seoTitle':
        settingsUpdates.seo_defaults = {
          ...(settingsUpdates.seo_defaults as Record<string, unknown> ?? {}),
          title: result.result_value,
        }
        break
      case 'seoDescription':
        settingsUpdates.seo_defaults = {
          ...(settingsUpdates.seo_defaults as Record<string, unknown> ?? {}),
          description: result.result_value,
        }
        break
    }
  }

  if (Object.keys(settingsUpdates).length > 0) {
    await db
      .from('site_settings')
      .upsert({ tenant_id: tenantId, ...settingsUpdates }, { onConflict: 'tenant_id' })
  }

  // If auto_publish, flip is_published
  if (auto_publish && !apply_only) {
    await db
      .from('site_settings')
      .update({ is_published: true })
      .eq('tenant_id', tenantId)

    // Promote draft pages to published
    await db
      .from('site_pages')
      .update({ status: 'published' })
      .eq('tenant_id', tenantId)
      .eq('status', 'draft')
  }

  // Audit
  await db.from('website_import_audit').insert({
    tenant_id: tenantId,
    job_id:    jobId,
    action:    auto_publish ? 'published' : 'applied',
    metadata:  {
      approved_count: results.length,
      auto_publish,
    },
  })

  return NextResponse.json({
    success:      true,
    applied:      results.length,
    auto_publish,
  })
}
