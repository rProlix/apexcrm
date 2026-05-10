// lib/website-ai/imagePipelineErrors.ts
// Shared error classification helpers for the AI Website Image pipeline.
// Use these in every API route that touches website_image_plans or website_image_jobs.

/**
 * Returns true when a Supabase/PostgREST error is the well-known
 * "table doesn't exist in schema cache" failure.
 *
 * Root cause: migration 054_website_image_plans_complete.sql has not been
 * applied to the Supabase project yet.
 */
export function isSchemaCacheError(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false
  const msg = (err.message ?? '').toLowerCase()
  return (
    msg.includes('schema cache') ||
    msg.includes('could not find the table') ||
    msg.includes('relation') ||
    (err.code === 'PGRST200') ||
    (err.code === 'PGRST205')
  )
}

/** Human-readable message shown in the UI when the table is missing. */
export const MISSING_TABLE_MESSAGE =
  'The website image plans table is missing. ' +
  'Run migration 054_website_image_plans_complete.sql in your Supabase SQL editor, ' +
  'then redeploy. See /api/owner/diagnostics/website-images for full status.'

/** Human-readable message when the storage bucket is missing. */
export const MISSING_BUCKET_MESSAGE =
  'The "website-assets" storage bucket does not exist. ' +
  'Run migration 054_website_image_plans_complete.sql or create the bucket manually ' +
  'in Supabase Dashboard → Storage → New bucket → name: "website-assets", public: true.'

/** Human-readable message when the Imagen API key is missing. */
export const MISSING_API_KEY_MESSAGE =
  'Imagen image generation is not configured. ' +
  'Add GEMINI_API_KEY to your Vercel environment variables and redeploy.'

/** Human-readable message for quota/rate-limit errors from the Imagen API. */
export const QUOTA_EXCEEDED_MESSAGE =
  'Image provider quota exceeded. Try again after billing or quota is updated in Google Cloud Console.'

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
