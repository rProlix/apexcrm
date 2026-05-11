// lib/website-images/checkWebsiteImageSchema.ts
// SERVER-ONLY — never import in client components.
//
// Performs a reliable health check on all AI website image pipeline tables.
// Uses the public.check_website_image_schema() RPC (migration 058) to bypass
// PostgREST's schema cache, which can return false-negative "table not found"
// errors for up to ~60s after a migration is applied.
//
// Falls back to direct information_schema queries if the RPC doesn't exist yet.

import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface TableHealth {
  exists:         boolean
  missingColumns: string[]
}

export interface WebsiteImageSchemaHealth {
  ok:                 boolean
  /** True when we successfully ran the RPC check (otherwise used fallback) */
  usedRpc:            boolean
  tables: {
    website_image_plans:    TableHealth
    website_image_jobs:     TableHealth
    website_section_images: TableHealth
  }
  /** True when website_generated_images exists as a view (compat layer) */
  compatViewExists:   boolean
  activateFnExists:   boolean
  allTablesPresent:   boolean
  /** Null when no issues detected */
  summary:            string | null
  errors:             string[]
}

const REQUIRED_COLS: Record<string, string[]> = {
  website_image_plans: [
    'id', 'tenant_id', 'page_id', 'section_id', 'status', 'prompt',
    'aspect_ratio', 'created_by', 'created_at', 'updated_at',
  ],
  website_image_jobs: [
    'id', 'tenant_id', 'plan_id', 'status', 'model', 'created_at',
  ],
  website_section_images: [
    'id', 'tenant_id', 'section_id', 'plan_id', 'image_url',
    'slot_key', 'is_active', 'is_archived', 'created_at',
  ],
}

export async function checkWebsiteImageSchema(): Promise<WebsiteImageSchemaHealth> {
  const supabase = getSupabaseServerClient()
  const errors: string[] = []

  // ── Try the RPC first (requires migration 058) ────────────────────────────
  try {
    const { data: rpcData, error: rpcErr } = await (supabase as unknown as {
      rpc: (fn: string) => { data: unknown; error: unknown }
    }).rpc('check_website_image_schema') as { data: unknown; error: { message: string } | null }

    if (!rpcErr && rpcData && typeof rpcData === 'object') {
      const d = rpcData as {
        tables:           Record<string, boolean>
        missingColumns:   Record<string, string[] | null>
        activateFnExists: boolean
        allTablesPresent: boolean
      }

      const plansOk = !!d.tables?.website_image_plans
      const jobsOk  = !!d.tables?.website_image_jobs
      const ssiOk   = !!d.tables?.website_section_images
      const allOk   = plansOk && jobsOk && ssiOk

      const missingTables: string[] = []
      if (!plansOk) missingTables.push('website_image_plans')
      if (!jobsOk)  missingTables.push('website_image_jobs')
      if (!ssiOk)   missingTables.push('website_section_images')

      const plansMissingCols  = (d.missingColumns?.website_image_plans   ?? []) as string[]
      const jobsMissingCols   = (d.missingColumns?.website_image_jobs    ?? []) as string[]
      const ssiMissingCols    = (d.missingColumns?.website_section_images ?? []) as string[]
      const anyMissingCols    = plansMissingCols.length + jobsMissingCols.length + ssiMissingCols.length > 0

      let summary: string | null = null
      if (!allOk) {
        summary = `Missing tables: ${missingTables.join(', ')}. Re-run migration 054_website_image_plans_complete.sql.`
      } else if (anyMissingCols) {
        summary = `Tables exist but have missing columns. Re-run migration 054.`
      }

      return {
        ok: allOk && !anyMissingCols,
        usedRpc: true,
        tables: {
          website_image_plans:    { exists: plansOk, missingColumns: plansMissingCols },
          website_image_jobs:     { exists: jobsOk,  missingColumns: jobsMissingCols  },
          website_section_images: { exists: ssiOk,   missingColumns: ssiMissingCols   },
        },
        compatViewExists:  !!d.tables?.website_generated_images_view,
        activateFnExists:  !!d.activateFnExists,
        allTablesPresent:  allOk,
        summary,
        errors,
      }
    }
    // RPC not found yet — fall through to direct check
    if (rpcErr) {
      errors.push(`RPC check_website_image_schema not available: ${rpcErr.message}. Run migration 058.`)
    }
  } catch (e) {
    errors.push(`RPC call threw: ${e instanceof Error ? e.message : String(e)}`)
  }

  // ── Fallback: direct information_schema queries ───────────────────────────
  async function tableExists(name: string): Promise<boolean> {
    try {
      const db = supabase as unknown as { from: (t: string) => ReturnType<typeof supabase.from> }
      const { error } = await db.from(name).select('id').limit(1)
      // If error contains schema cache / does not exist keywords → table missing
      if (!error) return true
      const msg = (error.message ?? '').toLowerCase()
      if (
        msg.includes('does not exist') ||
        msg.includes('schema cache') ||
        msg.includes('could not find') ||
        error.code === 'PGRST200' ||
        error.code === '42P01'
      ) return false
      // Other errors (RLS, etc.) likely mean the table exists but we can't read it
      return true
    } catch { return false }
  }

  async function getMissingColumns(tableName: string): Promise<string[]> {
    const required = REQUIRED_COLS[tableName] ?? []
    const missing: string[] = []
    for (const col of required) {
      try {
        const { error } = await supabase
          .from('information_schema.columns' as never)
          .select('column_name')
          .eq('table_schema', 'public')
          .eq('table_name', tableName)
          .eq('column_name', col)
          .single()
        if (error) missing.push(col)
      } catch { missing.push(col) }
    }
    return missing
  }

  const [plansOk, jobsOk, ssiOk] = await Promise.all([
    tableExists('website_image_plans'),
    tableExists('website_image_jobs'),
    tableExists('website_section_images'),
  ])

  const [plansMissingCols, jobsMissingCols, ssiMissingCols] = await Promise.all([
    plansOk ? getMissingColumns('website_image_plans')    : Promise.resolve(REQUIRED_COLS.website_image_plans),
    jobsOk  ? getMissingColumns('website_image_jobs')     : Promise.resolve(REQUIRED_COLS.website_image_jobs),
    ssiOk   ? getMissingColumns('website_section_images') : Promise.resolve(REQUIRED_COLS.website_section_images),
  ])

  const compatViewExists = await tableExists('website_generated_images')
  const allOk = plansOk && jobsOk && ssiOk
  const anyMissingCols = plansMissingCols.length + jobsMissingCols.length + ssiMissingCols.length > 0

  const missingTables: string[] = []
  if (!plansOk) missingTables.push('website_image_plans')
  if (!jobsOk)  missingTables.push('website_image_jobs')
  if (!ssiOk)   missingTables.push('website_section_images')

  let summary: string | null = null
  if (!allOk) {
    summary = (
      `Missing tables: ${missingTables.join(', ')}. ` +
      'Re-run migration 054_website_image_plans_complete.sql against the Supabase project ' +
      'that this Vercel deployment uses (check NEXT_PUBLIC_SUPABASE_URL).'
    )
  } else if (anyMissingCols) {
    summary = 'Tables exist but some required columns are missing. Re-run migration 054.'
  }

  return {
    ok: allOk && !anyMissingCols,
    usedRpc: false,
    tables: {
      website_image_plans:    { exists: plansOk, missingColumns: plansMissingCols },
      website_image_jobs:     { exists: jobsOk,  missingColumns: jobsMissingCols  },
      website_section_images: { exists: ssiOk,   missingColumns: ssiMissingCols   },
    },
    compatViewExists,
    activateFnExists: false, // can't check without RPC
    allTablesPresent: allOk,
    summary,
    errors,
  }
}
