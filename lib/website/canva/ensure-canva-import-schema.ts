// lib/website/canva/ensure-canva-import-schema.ts
// SERVER-ONLY. Lightweight guard that verifies the website_canva_imports table
// has the columns the Canva PDF/embed import code depends on. Used only in the
// PDF import + diagnostics paths (not on every request) so it never slows the
// hot path. Never exposes the service-role key to the browser.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

/** Columns added by migrations 085/086/087 that the import code requires. */
export const REQUIRED_CANVA_IMPORT_COLUMNS = [
  'pdf_storage_path',
  'pdf_file_name',
  'pdf_page_count',
  'pdf_analysis',
  'ai_conversion_status',
  'ai_conversion_summary',
  'animation_mapping',
  'iframe_src',
  'source_domain',
  'is_custom_domain',
  'validation_mode',
  'embed_status',
  'embed_warnings',
] as const

export interface CanvaImportSchemaResult {
  ok: boolean
  missing: string[]
  /** True when we could not run the check (treated as non-blocking). */
  checkSkipped: boolean
  message?: string
}

export const SCHEMA_MISSING_MESSAGE =
  'Database schema is missing Canva PDF import columns. Apply migration ' +
  'fix_canva_pdf_import_schema (087) and refresh the Supabase schema cache.'

/**
 * Returns which required columns are missing from website_canva_imports.
 * Reads information_schema (cheap, single query). On any error it returns
 * checkSkipped=true so it never blocks a request on its own.
 */
export async function ensureCanvaImportSchema(): Promise<CanvaImportSchemaResult> {
  const db = getSupabaseServerClient() as DB
  try {
    const { data, error } = await db
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'website_canva_imports')

    if (error || !Array.isArray(data)) {
      return { ok: true, missing: [], checkSkipped: true }
    }

    const present = new Set((data as Array<{ column_name: string }>).map((r) => r.column_name))
    const missing = REQUIRED_CANVA_IMPORT_COLUMNS.filter((c) => !present.has(c))
    return {
      ok: missing.length === 0,
      missing,
      checkSkipped: false,
      message: missing.length ? SCHEMA_MISSING_MESSAGE : undefined,
    }
  } catch {
    return { ok: true, missing: [], checkSkipped: true }
  }
}

/** True when a DB error message indicates a missing column / stale schema cache. */
export function isMissingColumnError(message: string | null | undefined): boolean {
  if (!message) return false
  const m = message.toLowerCase()
  return (
    m.includes('schema cache') ||
    (m.includes('could not find') && m.includes('column')) ||
    (m.includes('column') && m.includes('does not exist'))
  )
}
