// app/api/website/ai-images/health/route.ts
// GET /api/website/ai-images/health
// Checks every dependency of the AI Website Image Builder.
// Protected: only owner/admin may call this route.

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { WEBSITE_IMAGE_BUCKET, WEBSITE_IMAGE_MODEL, getWebsiteImageModel } from '@/lib/ai/websiteImageConfig'

export const dynamic = 'force-dynamic'

interface HealthCheck {
  name:    string
  ok:      boolean
  detail?: string
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(ctx.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const checks: HealthCheck[] = []
  const supabase = getSupabaseServerClient()

  // ── 1. GEMINI_API_KEY ─────────────────────────────────────────────────────
  const hasApiKey = !!process.env.GEMINI_API_KEY
  checks.push({
    name:   'GEMINI_API_KEY',
    ok:     hasApiKey,
    detail: hasApiKey ? 'Present (value hidden)' : 'MISSING — set GEMINI_API_KEY in environment variables',
  })

  // ── 2. SUPABASE_SERVICE_ROLE_KEY ──────────────────────────────────────────
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  checks.push({
    name:   'SUPABASE_SERVICE_ROLE_KEY',
    ok:     hasServiceKey,
    detail: hasServiceKey ? 'Present (value hidden)' : 'MISSING — storage uploads will fail',
  })

  // ── 3. NEXT_PUBLIC_SUPABASE_URL ───────────────────────────────────────────
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  checks.push({
    name:   'NEXT_PUBLIC_SUPABASE_URL',
    ok:     !!supabaseUrl,
    detail: supabaseUrl ? supabaseUrl : 'MISSING',
  })

  // ── 4. Image model ────────────────────────────────────────────────────────
  const activeModel = getWebsiteImageModel()
  checks.push({
    name:   'WEBSITE_IMAGE_MODEL',
    ok:     activeModel === WEBSITE_IMAGE_MODEL,
    detail: `Active model: ${activeModel} (expected: ${WEBSITE_IMAGE_MODEL})${
      activeModel !== WEBSITE_IMAGE_MODEL ? ' — override is active via WEBSITE_IMAGE_MODEL env var' : ''
    }`,
  })

  // ── 5. Supabase Storage bucket ────────────────────────────────────────────
  let bucketOk = false
  let bucketDetail = ''
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets()
    if (error) {
      bucketDetail = `listBuckets error: ${error.message}`
    } else {
      const found = buckets?.find(b => b.id === WEBSITE_IMAGE_BUCKET)
      bucketOk    = !!found
      bucketDetail = found
        ? `Bucket "${WEBSITE_IMAGE_BUCKET}" exists (public: ${found.public})`
        : `Bucket "${WEBSITE_IMAGE_BUCKET}" NOT FOUND — run migration 031_website_assets_bucket.sql`
    }
  } catch (err) {
    bucketDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: `Storage bucket: ${WEBSITE_IMAGE_BUCKET}`, ok: bucketOk, detail: bucketDetail })

  // ── 6. DB: website_image_plans table ────────────────────────────────────
  let plansTableOk = false
  let plansDetail  = ''
  try {
    const { error } = await supabase.from('website_image_plans').select('id').limit(1)
    plansTableOk = !error
    plansDetail  = error ? `Error: ${error.message}` : 'Table accessible'
  } catch (err) {
    plansDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: 'DB: website_image_plans', ok: plansTableOk, detail: plansDetail })

  // ── 7. DB: website_image_jobs table ─────────────────────────────────────
  let jobsTableOk = false
  let jobsDetail  = ''
  try {
    const { error } = await supabase.from('website_image_jobs').select('id').limit(1)
    jobsTableOk = !error
    jobsDetail  = error ? `Error: ${error.message}` : 'Table accessible'
  } catch (err) {
    jobsDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
  }
  checks.push({ name: 'DB: website_image_jobs', ok: jobsTableOk, detail: jobsDetail })

  // ── 8. Tenant access (if tenantId query param provided) ─────────────────
  const { searchParams } = new URL(req.url)
  const tenantId = searchParams.get('tenantId')
  if (tenantId) {
    let tenantOk = false
    let tenantDetail = ''
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name')
        .eq('id', tenantId)
        .single()
      tenantOk    = !error && !!data
      tenantDetail = data ? `Tenant: ${data.name}` : (error ? error.message : 'Not found')
    } catch (err) {
      tenantDetail = `Exception: ${err instanceof Error ? err.message : String(err)}`
    }
    checks.push({ name: `Tenant access: ${tenantId}`, ok: tenantOk, detail: tenantDetail })
  }

  // ── 9. Public URL format ──────────────────────────────────────────────────
  const samplePath = `tenants/test-tenant-id/website/generated/test-plan-id/hero_background_123.png`
  const { data: urlData } = supabase.storage.from(WEBSITE_IMAGE_BUCKET).getPublicUrl(samplePath)
  checks.push({
    name:   'Public URL format',
    ok:     !!urlData.publicUrl,
    detail: urlData.publicUrl || 'Could not construct public URL',
  })

  const allOk = checks.every(c => c.ok)

  return NextResponse.json({ ok: allOk, checks }, { status: allOk ? 200 : 207 })
}
