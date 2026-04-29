/**
 * safeQuery — type-safe Supabase result unwrapper.
 *
 * Supabase query results carry both `.data` and `.error`. When the TypeScript
 * types are out of sync with the live schema, the compiler encodes the
 * mismatch as a `SelectQueryError<"...">[]` value inside `.data`, which makes
 * direct `as T[]` assertions fail at compile time.
 *
 * This helper:
 *  1. Logs the error instead of silently swallowing it
 *  2. Validates that `.data` is actually an array before casting
 *  3. Returns a typed empty array on any failure — safe for SSR
 *  4. Never uses `as any`
 */
export function safeQuery<T>(result: {
  data:  unknown
  error: { message: string } | null
}): T[] {
  if (result.error) {
    console.error('[safeQuery] Supabase error:', result.error.message)
    return []
  }

  if (!Array.isArray(result.data)) {
    return []
  }

  return result.data as T[]
}

/**
 * safeSingle — unwraps a `.maybeSingle()` result safely.
 *
 * Returns `null` on error or missing row, logs the error if present.
 */
export function safeSingle<T>(result: {
  data:  unknown
  error: { message: string } | null
}): T | null {
  if (result.error) {
    console.error('[safeSingle] Supabase error:', result.error.message)
    return null
  }

  if (result.data === null || result.data === undefined) {
    return null
  }

  return result.data as T
}
