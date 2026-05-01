// lib/supabase/safeQuery.ts
//
// Helpers that turn Supabase's { data, error } tuple into typed, non-null
// values — or throw with a clear message on failure.
//
// Named exports (alphabetical):
//   safeQuery    – list query   → T[]        (throws on error, returns [] when empty)
//   safeSingle   – single row   → T          (throws if missing or error)
//   safeOptional – optional row → T | null   (throws only on DB error)
//   requireData  – alias for safeSingle (backward compat)
//   safeData     – alias for safeOptional (backward compat)
//   toRecord     – cast to Record for safe spreading
//   apiError     – converts caught errors into NextResponse 500

import { NextResponse } from 'next/server'

type QueryError = { message: string } | null | undefined

// ── Primary helpers ───────────────────────────────────────────────────────────

/**
 * List query helper — asserts no DB error and returns the rows array.
 * Returns an empty array when Supabase returns null (empty result set).
 *
 * @example
 *   const { data, error } = await supabase.from('products').select('*')
 *   const products = safeQuery<Product>(data, error)
 */
export function safeQuery<T>(
  data:  T[] | null | undefined,
  error: QueryError,
): T[] {
  if (error) throw new Error(error.message ?? 'Query failed')
  return (data ?? []) as T[]
}

/**
 * Single-row helper — throws if the row is missing or the query errored.
 * Use when the row MUST exist (e.g. after a prior existence check).
 *
 * @example
 *   const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle()
 *   const product = safeSingle<Product>(data, error)
 */
export function safeSingle<T>(
  data:  T | null | undefined,
  error: QueryError,
  message = 'Record not found',
): T {
  if (error) throw new Error(error.message ?? 'Query failed')
  if (!data) throw new Error(message)
  return data as T
}

/**
 * Optional single-row helper — returns null when the row is absent.
 * Throws only on a real DB error.
 *
 * @example
 *   const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle()
 *   const product = safeOptional<Product>(data, error)
 *   if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
 */
export function safeOptional<T>(
  data:  T | null | undefined,
  error: QueryError,
): T | null {
  if (error) throw new Error(error.message ?? 'Query failed')
  return data ?? null
}

// ── Backward-compatible aliases ───────────────────────────────────────────────

/** @alias safeSingle */
export const requireData = safeSingle

/** @alias safeOptional */
export const safeData = safeOptional

// ── Spread helper ─────────────────────────────────────────────────────────────

/**
 * Casts a Supabase row to a plain Record for safe spreading.
 * Call AFTER a null check — throws at runtime if the value is not an object.
 *
 * @example
 *   const row = safeSingle(data, error)
 *   return NextResponse.json({ ...toRecord(row), extra: 1 })
 */
export function toRecord(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') {
    throw new Error('toRecord: value is not a spreadable object')
  }
  return row as Record<string, unknown>
}

// ── Route error helper ────────────────────────────────────────────────────────

/**
 * Converts a caught unknown error into a JSON 500 NextResponse.
 *
 * @example
 *   } catch (err) {
 *     return apiError(err, '[POST /api/360/generate]')
 *   }
 */
export function apiError(
  err:    unknown,
  prefix = '[API]',
  status  = 500,
): ReturnType<typeof NextResponse.json> {
  const message = err instanceof Error ? err.message : String(err)
  console.error(prefix, message)
  return NextResponse.json({ error: message }, { status })
}
