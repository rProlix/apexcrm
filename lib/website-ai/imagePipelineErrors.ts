// lib/website-ai/imagePipelineErrors.ts
// Shared error classification helpers for the AI Website Image pipeline.
// Use these in every API route that touches website_image_plans or website_image_jobs.

/**
 * Returns true when a Supabase/PostgREST error indicates a table genuinely
 * does not exist in the database schema.
 *
 * IMPORTANT: Do NOT match on just 'relation' — that word appears in many
 * unrelated PostgreSQL error messages (FK violations, type errors, etc.)
 * and would produce false positives that show the wrong user-facing error.
 *
 * Specific patterns we match:
 *  - PostgREST PGRST200 / PGRST205 — schema cache miss
 *  - 'schema cache'     — PostgREST explicit message
 *  - 'could not find the table' — PostgREST alternative wording
 *  - 'relation … does not exist' — PostgreSQL 42P01 error (table not found)
 *  - pg code 42P01      — PostgreSQL "undefined table" SQLSTATE
 */
export function isSchemaCacheError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false
  const msg  = (err.message ?? '').toLowerCase()
  const code = (err.code ?? '').toUpperCase()
  return (
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    // PostgreSQL "relation X does not exist" — must require BOTH words
    (msg.includes('relation') && msg.includes('does not exist')) ||
    code === 'PGRST200' ||
    code === 'PGRST205' ||
    code === '42P01'    // PostgreSQL undefined_table SQLSTATE
  )
}

/**
 * Extract the table name from a Postgres "relation X does not exist" error.
 * Returns null if the pattern is not found.
 */
export function extractMissingTableName(err: { message?: string } | null | undefined): string | null {
  if (!err?.message) return null
  const m = err.message.match(/relation\s+"?([^"]+)"?\s+does not exist/i)
  return m ? m[1] : null
}

/**
 * Build a human-readable error message that names the specific missing table
 * (not always website_image_plans — could be website_image_jobs, etc.).
 */
export function buildTableMissingMessage(tableName: string | null): string {
  const tbl = tableName ?? 'a required AI image table'
  return (
    `Database table "${tbl}" was not found in the public schema. ` +
    'Run migration 054_website_image_plans_complete.sql AND 058_schema_check_helpers.sql ' +
    'in your Supabase SQL editor (for the same project your Vercel deployment uses), ' +
    'then redeploy. ' +
    'Verify at /api/owner/diagnostics/website-images — all tables should show ok: true.'
  )
}

/** Human-readable message shown in the UI when the table is missing. */
export const MISSING_TABLE_MESSAGE =
  'One or more AI image database tables are missing. ' +
  'Run migration 054_website_image_plans_complete.sql in your Supabase SQL editor ' +
  '(the same project your Vercel deployment points to), then redeploy. ' +
  'If you already ran the migration, check /api/owner/diagnostics/website-images — ' +
  'it may be connected to a different Supabase project, or the table may be missing ' +
  'from a partial migration run (website_image_jobs or website_section_images).'

/** Human-readable message when the storage bucket is missing. */
export const MISSING_BUCKET_MESSAGE =
  'The "website-assets" storage bucket does not exist. ' +
  'Run migration 054_website_image_plans_complete.sql or create the bucket manually ' +
  'in Supabase Dashboard → Storage → New bucket → name: "website-assets", public: true.'

/** Provider-neutral message when the AI image service is not configured. */
export const MISSING_API_KEY_MESSAGE =
  'AI image generation is not configured. Ask an administrator to configure the server-side AI image service.'

/** Provider-neutral message for quota/rate-limit errors. */
export const QUOTA_EXCEEDED_MESSAGE =
  'AI image generation is temporarily at capacity. Try again later or contact an administrator.'

/** Detect quota / rate limit from Imagen API error text. */
export function isQuotaError(errText: string): boolean {
  const t = errText.toLowerCase()
  return (
    t.includes('quota') ||
    t.includes('rate limit') ||
    t.includes('resource_exhausted') ||
    t.includes('429')
  )
}

/**
 * Returns true when a Supabase error is a FK violation on created_by.
 *
 * This happens when the code passes ctx.id (public.users.id) instead of
 * ctx.auth_id (auth.users.id) as created_by. The FK references auth.users(id).
 */
export function isFkCreatedByError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false
  const msg  = (err.message ?? '').toLowerCase()
  const code = err.code ?? ''
  return (
    code === '23503' ||
    (msg.includes('foreign key') && msg.includes('created_by')) ||
    msg.includes('website_image_plans_created_by_fkey') ||
    msg.includes('website_image_jobs_created_by_fkey')
  )
}
