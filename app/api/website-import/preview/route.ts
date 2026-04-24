// app/api/website-import/preview/route.ts
// Returns a preview of the draft site that would be generated from an import job's
// current approved results, without saving anything.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { mapImportToSite } from '@/lib/website-import/mapImportToSite'
import type { NormalizedImportContent } from '@/lib/website-import/types'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── GET /api/website-import/preview?job_id=... ───────────────────────────────
// Returns a preview of what the website would look like from the import results.

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || ctx.role !== 'owner') return forbidden()

  const jobId = req.nextUrl.searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = getSupabaseServerClient() as any

  // Load all results for the job
  const { data: results } = await db
    .from('website_import_results')
    .select('result_key, result_value, confidence_score, approved, mapped_section')
    .eq('job_id', jobId)

  if (!results?.length) {
    return NextResponse.json({ error: 'No results found for job' }, { status: 404 })
  }

  // Reconstruct normalized content from saved results
  const normalized: Partial<NormalizedImportContent> = {
    confidenceMap: {},
  }

  for (const r of results) {
    const key = r.result_key as keyof NormalizedImportContent
    if (key === 'confidenceMap') continue

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(normalized as any)[key] = r.result_value
    if (normalized.confidenceMap) {
      normalized.confidenceMap[key] = r.confidence_score
    }
  }

  // Fill in empty defaults for required fields
  const content: NormalizedImportContent = {
    businessName:   null,
    tagline:        null,
    description:    null,
    logoUrl:        null,
    faviconUrl:     null,
    phone:          null,
    email:          null,
    address:        null,
    hours:          [],
    socialLinks:    {},
    services:       [],
    testimonials:   [],
    faqItems:       [],
    images:         [],
    brandColors:    null,
    seoTitle:       null,
    seoDescription: null,
    mapUrl:         null,
    latitude:       null,
    longitude:      null,
    priceRange:     null,
    confidenceMap:  {},
    ...normalized,
  }

  const draftConfig = mapImportToSite(content)

  return NextResponse.json({
    success: true,
    preview: draftConfig,
    approved_count: results.filter((r: Record<string, unknown>) => r.approved).length,
    total_count:    results.length,
  })
}
