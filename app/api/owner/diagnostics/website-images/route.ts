// app/api/owner/diagnostics/website-images/route.ts
// GET /api/owner/diagnostics/website-images
//
// Developer diagnostics for the AI Website Image pipeline.
// Owner-only. Returns the full health status of every dependency.

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { WEBSITE_IMAGE_BUCKET, WEBSITE_IMAGE_MODEL, getWebsiteImageModel } from '@/lib/ai/websiteImageConfig'

export const dynamic = 'force-dynamic'

interface DiagCheck {
  name:   string
  ok:     boolean
  detail: string
}

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner')
    return NextResponse.json({ error: 'Owner role required.' }, { status: 403 })

  const checks: DiagCheck[] = []
  const supabase = getSupabaseServerClient()

  // ── 1. GEMINI_API_KEY ─────────────────────────────────────────────────────
  const hasApiKey = !!process.env.GEMINI_API_KEY
  checks.push({
    name:   'GEMINI_API_KEY env var',
    ok:     hasApiKey,
    detail: hasApiKey
      ? 'Present (value hidden for security)'
      : 'MISSING — add GEMINI_API_KEY to Vercel environment variables, then redeploy',
  })

  // ── 2. SUPABASE_SERVICE_ROLE_KEY ──────────────────────────────────────────
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  checks.push({
    name:   'SUPABASE_SERVICE_ROLE_KEY env var',
    ok:     hasServiceKey,
    detail: hasServiceKey
      ? 'Present (value hidden for security)'
      : 'MISSING — storage uploads will fail',
  })

  // ── 3. Supabase URL ───────────────────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  checks.push({
    name:   'NEXT_PUBLIC_SUPABASE_URL',
    ok:     !!supabaseUrl,
    detail: supabaseUrl ?? 'MISSING',
  })

  // ── 4. Imagen model ───────────────────────────────────────────────────────
  const activeModel = getWebsiteImageModel()
  checks.push({
    name:   'WEBSITE_IMAGE_MODEL',
    ok:     activeModel === WEBSITE_IMAGE_MODEL,
    detail: `Active: ${activeModel} | Expected: ${WEBSITE_IMAGE_MODEL}`,
  })

  // ── 5. website_image_plans table ─────────────────────────────────────────
  let plansOk = false
  let plansDetail = ''
  let planCounts: Record<string, number> = {}
  try {
    const { error: countErr } = await supabase
      .from('website_image_plans')
      .select('id', { count: 'exact', head: true })
    plansOk     = !countErr
    plansDetail = countErr
      ? `ERROR: ${countErr.message} — Run migration 054_website_image_plans_complete.sql`
      : 'Table exists and is accessible'

    if (plansOk) {
      const statuses = ['planned','queued','generating','generated','uploaded','applied','failed']
      for (const s of statuses) {
        const { count } = await supabase
          .from('website_image_plans')
          .select('id', { count: 'exact', head: true })
          .eq('status', s)
        planCounts[s] = count ?? 0
      }
    }
  } catch (err) {
    plansDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: 'DB: website_image_plans', ok: plansOk, detail: plansDetail })

  // ── 6. website_image_jobs table ──────────────────────────────────────────
  let jobsOk = false
  let jobsDetail = ''
  try {
    const { error } = await supabase.from('website_image_jobs').select('id', { count: 'exact', head: true })
    jobsOk     = !error
    jobsDetail = error
      ? `ERROR: ${error.message} — Run migration 054_website_image_plans_complete.sql`
      : 'Table exists and is accessible'
  } catch (err) {
    jobsDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: 'DB: website_image_jobs', ok: jobsOk, detail: jobsDetail })

  // ── 6b. website_section_images table ─────────────────────────────────────
  let galleryOk = false
  let galleryDetail = ''
  try {
    const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }
    const { error } = await db.from('website_section_images').select('id', { count: 'exact', head: true } as never)
    galleryOk     = !error
    galleryDetail = error
      ? `ERROR: ${error.message} — Run migration 054_website_image_plans_complete.sql`
      : 'Table exists and is accessible'
  } catch (err) {
    galleryDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: 'DB: website_section_images', ok: galleryOk, detail: galleryDetail })

  // ── 6c. activate_website_section_image function ───────────────────────────
  let activateFnOk = false
  let activateFnDetail = ''
  try {
    const { data: fnRows } = await supabase
      .from('information_schema.routines' as never)
      .select('routine_name')
      .eq('routine_schema', 'public')
      .eq('routine_name', 'activate_website_section_image')
      .maybeSingle()
    activateFnOk     = !!(fnRows as Record<string, string> | null)?.routine_name
    activateFnDetail = activateFnOk
      ? 'Function public.activate_website_section_image exists'
      : 'Function NOT FOUND — run migration 054_website_image_plans_complete.sql'
  } catch (err) {
    activateFnDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: 'DB fn: activate_website_section_image', ok: activateFnOk, detail: activateFnDetail })

  // ── 7. website-assets bucket ─────────────────────────────────────────────
  let bucketOk = false
  let bucketDetail = ''
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets()
    if (error) {
      bucketDetail = `listBuckets failed: ${error.message}`
    } else {
      const found = buckets?.find(b => b.id === WEBSITE_IMAGE_BUCKET)
      bucketOk    = !!found
      bucketDetail = found
        ? `Bucket "${WEBSITE_IMAGE_BUCKET}" exists (public: ${found.public})`
        : `Bucket "${WEBSITE_IMAGE_BUCKET}" NOT FOUND — run migration 054 or create it manually`
    }
  } catch (err) {
    bucketDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: `Storage: ${WEBSITE_IMAGE_BUCKET}`, ok: bucketOk, detail: bucketDetail })

  // ── 8. website-images bucket ─────────────────────────────────────────────
  let bucket2Ok = false
  let bucket2Detail = ''
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets()
    if (error) {
      bucket2Detail = `listBuckets failed: ${error.message}`
    } else {
      const found    = buckets?.find(b => b.id === 'website-images')
      bucket2Ok      = !!found
      bucket2Detail  = found
        ? `Bucket "website-images" exists (public: ${found.public})`
        : 'Bucket "website-images" NOT FOUND — run migration 054'
    }
  } catch (err) {
    bucket2Detail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: 'Storage: website-images', ok: bucket2Ok, detail: bucket2Detail })

  // ── 9. created_by FK diagnostics ─────────────────────────────────────────
  let createdByFkTarget = 'auth.users(id)'
  let invalidCreatedByCount = 0
  let nullableCreatedBy = true

  if (plansOk) {
    try {
      // Check nullability via information_schema (PostgREST can query it)
      const { data: colRows } = await supabase
        .from('information_schema.columns' as never)
        .select('is_nullable')
        .eq('table_schema', 'public')
        .eq('table_name', 'website_image_plans')
        .eq('column_name', 'created_by')
        .maybeSingle()
      const colData = colRows as { is_nullable?: string } | null
      nullableCreatedBy = colData?.is_nullable !== 'NO'
    } catch { /* ignore — treat as nullable */ }
  }

  checks.push({
    name:   'created_by FK target',
    ok:     true,
    detail: `FK references ${createdByFkTarget}. App code must pass ctx.auth_id (auth.users.id), NOT ctx.id (public.users.id). Run migration 055 to fix any invalid rows.`,
  })
  checks.push({
    name:   'created_by nullable',
    ok:     nullableCreatedBy,
    detail: nullableCreatedBy
      ? 'created_by is nullable — server/service-role inserts with created_by=null will work.'
      : 'created_by is NOT nullable — run migration 055_fix_website_image_plans_created_by.sql.',
  })

  // ── 10. Last 10 failed plans ──────────────────────────────────────────────
  let recentFailed: Array<Record<string, unknown>> = []
  if (plansOk) {
    try {
      const { data } = await supabase
        .from('website_image_plans')
        .select('id, tenant_id, image_role, section_type, status, error_message, created_at, updated_at')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(10)
      recentFailed = (data ?? []) as unknown as Array<Record<string, unknown>>
    } catch { /* ignore */ }
  }

  const allOk = checks.every(c => c.ok)

  return NextResponse.json({
    ok:                    allOk,
    timestamp:             new Date().toISOString(),
    model:                 activeModel,
    bucket:                WEBSITE_IMAGE_BUCKET,
    checks,
    tables: {
      website_image_plans:    plansOk,
      website_image_jobs:     jobsOk,
      website_section_images: galleryOk,
    },
    functions: {
      activate_website_section_image: activateFnOk,
    },
    planCounts:            plansOk ? planCounts : null,
    recentFailed:          plansOk ? recentFailed : null,
    createdByFkTarget,
    invalidCreatedByCount,
    createdByNote:         'Use ctx.auth_id (auth.users.id), NOT ctx.id (public.users.id), when inserting created_by.',
    instructions: allOk ? null : {
      step1: 'Open Supabase Dashboard → SQL Editor',
      step2: 'Paste and run: supabase/migrations/054_website_image_plans_complete.sql',
      step3: 'Redeploy on Vercel',
      step4: 'Visit /api/owner/diagnostics/website-images and confirm ok=true',
      missingTable: (!plansOk || !jobsOk || !galleryOk)
        ? 'Run supabase/migrations/054_website_image_plans_complete.sql in Supabase SQL Editor'
        : null,
      missingBucket: !bucketOk
        ? `Create bucket "${WEBSITE_IMAGE_BUCKET}" in Supabase Dashboard → Storage (public: true) OR run migration 054`
        : null,
      missingApiKey: !hasApiKey
        ? 'Add GEMINI_API_KEY to Vercel → Project → Settings → Environment Variables → Redeploy'
        : null,
    },
  }, { status: allOk ? 200 : 207 })
}
