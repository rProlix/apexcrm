// app/api/owner/diagnostics/website-images/route.ts
// GET /api/owner/diagnostics/website-images
//
// Full health-check for the AI Website Image pipeline.
// Owner-only. Uses check_website_image_schema() RPC (migration 058) to bypass
// PostgREST schema cache so results are accurate immediately after a migration.

export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { checkWebsiteImageSchema } from '@/lib/website-images/checkWebsiteImageSchema'
import { WEBSITE_IMAGE_BUCKET, WEBSITE_IMAGE_MODEL, getWebsiteImageModel } from '@/lib/ai/websiteImageConfig'
import { getSupabaseServerClient } from '@/lib/supabase/server'

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx)            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (ctx.role !== 'owner')
    return NextResponse.json({ error: 'Owner role required.' }, { status: 403 })

  const supabase = getSupabaseServerClient()

  // ── 1. Schema check (uses RPC if available, falls back to direct) ─────────
  const schema = await checkWebsiteImageSchema()

  // ── 2. Storage buckets ─────────────────────────────────────────────────────
  let bucketsChecked = false
  let assetsOk       = false
  let imagesOk       = false
  let bucketDetail   = ''
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets()
    if (error) {
      bucketDetail = `listBuckets failed: ${error.message}`
    } else {
      bucketsChecked = true
      assetsOk = !!buckets?.find(b => b.id === WEBSITE_IMAGE_BUCKET)
      imagesOk = !!buckets?.find(b => b.id === 'website-images')
    }
  } catch (e) {
    bucketDetail = `Exception: ${e instanceof Error ? e.message : String(e)}`
  }

  // ── 3. Environment variables ───────────────────────────────────────────────
  const geminiKey     = !!process.env.GEMINI_API_KEY
  const serviceKey    = !!process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null
  const activeModel   = getWebsiteImageModel()

  // ── 4. created_by column nullability ──────────────────────────────────────
  let createdByNullable = true
  if (schema.tables.website_image_plans.exists) {
    try {
      const { data } = await supabase
        .from('information_schema.columns' as never)
        .select('is_nullable')
        .eq('table_schema', 'public')
        .eq('table_name', 'website_image_plans')
        .eq('column_name', 'created_by')
        .maybeSingle()
      const col = data as { is_nullable?: string } | null
      createdByNullable = col?.is_nullable !== 'NO'
    } catch { /* treat as nullable */ }
  }

  // ── 5. Recent failed plans ────────────────────────────────────────────────
  let recentFailed: Array<Record<string, unknown>> = []
  if (schema.tables.website_image_plans.exists) {
    try {
      const { data } = await supabase
        .from('website_image_plans')
        .select('id, tenant_id, section_type, status, error_message, created_at')
        .eq('status', 'failed')
        .order('updated_at', { ascending: false })
        .limit(5)
      recentFailed = (data ?? []) as unknown as Array<Record<string, unknown>>
    } catch { /* ignore */ }
  }

  // ── 6. Build structured response ──────────────────────────────────────────
  const envOk    = geminiKey && serviceKey && !!supabaseUrl
  const bucketOk = assetsOk || imagesOk
  const allOk    = schema.ok && envOk && bucketOk

  // Smart contextual guidance
  const fixes: string[] = []
  if (!schema.tables.website_image_plans.exists)
    fixes.push('Run migration 054_website_image_plans_complete.sql — table website_image_plans is missing.')
  if (!schema.tables.website_image_jobs.exists)
    fixes.push('Run migration 054_website_image_plans_complete.sql — table website_image_jobs is missing.')
  if (!schema.tables.website_section_images.exists)
    fixes.push('Run migration 054_website_image_plans_complete.sql — table website_section_images is missing.')
  if (schema.tables.website_image_plans.missingColumns.length)
    fixes.push(`website_image_plans is missing columns: ${schema.tables.website_image_plans.missingColumns.join(', ')} — re-run migration 054.`)
  if (schema.tables.website_image_jobs.missingColumns.length)
    fixes.push(`website_image_jobs is missing columns: ${schema.tables.website_image_jobs.missingColumns.join(', ')} — re-run migration 054.`)
  if (schema.tables.website_section_images.missingColumns.length)
    fixes.push(`website_section_images is missing columns: ${schema.tables.website_section_images.missingColumns.join(', ')} — re-run migration 054.`)
  if (!schema.compatViewExists)
    fixes.push('website_generated_images compatibility view is missing — re-run migration 054.')
  if (!geminiKey)
    fixes.push('Add GEMINI_API_KEY to Vercel → Project → Settings → Environment Variables → Redeploy.')
  if (!serviceKey)
    fixes.push('Add SUPABASE_SERVICE_ROLE_KEY to Vercel environment variables.')
  if (!supabaseUrl)
    fixes.push('NEXT_PUBLIC_SUPABASE_URL is not set. Check Vercel environment variables.')
  if (!schema.usedRpc)
    fixes.push('Run migration 058_schema_check_helpers.sql to enable accurate schema detection via RPC.')
  if (bucketsChecked && !assetsOk && !imagesOk)
    fixes.push(`Storage bucket "${WEBSITE_IMAGE_BUCKET}" not found. Run migration 054 or create it manually in Supabase Dashboard → Storage.`)
  if (!createdByNullable)
    fixes.push('created_by column in website_image_plans is NOT NULL — re-run migration 054 to make it nullable.')
  if (supabaseUrl && schema.ok && !schema.usedRpc)
    fixes.push('The app may be connected to a different Supabase project. Verify NEXT_PUBLIC_SUPABASE_URL matches the project where you ran migration 054.')

  return NextResponse.json({
    ok:        allOk,
    timestamp: new Date().toISOString(),
    checkMethod: schema.usedRpc ? 'rpc_check_website_image_schema' : 'direct_query_fallback',

    supabase: {
      url:              supabaseUrl,
      serviceRolePresent: serviceKey,
      note: schema.usedRpc
        ? 'Schema checked via RPC — bypasses PostgREST cache. Results are authoritative.'
        : 'Schema checked via direct query — run migration 058_schema_check_helpers.sql for authoritative RPC-based checks.',
    },

    tables: {
      website_image_plans: {
        exists:         schema.tables.website_image_plans.exists,
        missingColumns: schema.tables.website_image_plans.missingColumns,
      },
      website_image_jobs: {
        exists:         schema.tables.website_image_jobs.exists,
        missingColumns: schema.tables.website_image_jobs.missingColumns,
      },
      website_section_images: {
        exists:         schema.tables.website_section_images.exists,
        missingColumns: schema.tables.website_section_images.missingColumns,
      },
      website_generated_images_view: {
        exists: schema.compatViewExists,
        note:   'Compatibility view over website_section_images for old code references.',
      },
    },

    functions: {
      activate_website_section_image: schema.activateFnExists,
      check_website_image_schema_rpc: schema.usedRpc,
    },

    storage: {
      [WEBSITE_IMAGE_BUCKET]: assetsOk,
      'website-images':       imagesOk,
      bucketCheckError:       bucketDetail || null,
    },

    env: {
      GEMINI_API_KEY:             geminiKey ? 'present' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY:  serviceKey ? 'present' : 'MISSING',
      NEXT_PUBLIC_SUPABASE_URL:   supabaseUrl ?? 'MISSING',
      WEBSITE_IMAGE_MODEL:        activeModel,
      expectedModel:              WEBSITE_IMAGE_MODEL,
      modelMatchesExpected:       activeModel === WEBSITE_IMAGE_MODEL,
    },

    database: {
      allTablesPresent: schema.allTablesPresent,
      createdByNullable,
      schemaErrors:     schema.errors,
      schemaSummary:    schema.summary,
    },

    recentFailedPlans: recentFailed,
    fixes,

    instructions: fixes.length === 0 ? null : {
      step1: 'In your Supabase Dashboard → SQL Editor, run:',
      step2: '  supabase/migrations/054_website_image_plans_complete.sql',
      step3: '  supabase/migrations/058_schema_check_helpers.sql',
      step4: 'Redeploy on Vercel.',
      step5: 'Visit /api/owner/diagnostics/website-images and confirm ok=true.',
      warning: 'Ensure you are running migrations against the SAME Supabase project ' +
               'that NEXT_PUBLIC_SUPABASE_URL points to.',
    },
  }, { status: allOk ? 200 : 207 })
}
