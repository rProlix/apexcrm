// lib/supabase/safeQuery.ts
//
// Lightweight helpers that turn Supabase's { data, error } tuple into a
// guaranteed non-null value — or throw/return early with a typed error.
//
// Usage (in an API route):
//
//   import { requireData, safeData } from '@/lib/supabase/safeQuery'
//
//   // throws if missing — use inside try/catch blocks
//   const pkg = requireData(data, error)
//
//   // returns null if missing — use when absence is expected
//   const pkg = safeData(data, error)

import { NextResponse } from 'next/server'

// ── Core helpers ──────────────────────────────────────────────────────────────

/**
 * Asserts that a Supabase query returned a non-null row.
 * Throws if `error` is set or `data` is null/undefined.
 *
 * @example
 *   const pkg = requireData<Product360Package>(data, error, 'Package not found')
 */
export function requireData<T>(
  data:    T | null | undefined,
  error:   { message: string } | null | undefined,
  message = 'Not found',
): T {
  if (error)  throw new Error(error.message)
  if (!data)  throw new Error(message)
  return data
}

/**
 * Returns null instead of throwing when data is absent.
 * Throws only if `error` is set (DB-level failure, not just a missing row).
 *
 * @example
 *   const pkg = safeData(data, error)
 *   if (!pkg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
 */
export function safeData<T>(
  data:  T | null | undefined,
  error: { message: string } | null | undefined,
): T | null {
  if (error) throw new Error(error.message)
  return data ?? null
}

// ── Spread helper ─────────────────────────────────────────────────────────────

/**
 * Casts a Supabase row to a plain Record so it can be spread safely.
 * Always guard against null BEFORE calling this.
 *
 * @example
 *   const row = requireData(data, error)
 *   return NextResponse.json({ ...toRecord(row), extra_field: 123 })
 */
export function toRecord(row: unknown): Record<string, unknown> {
  if (!row || typeof row !== 'object') {
    throw new Error('Cannot spread a non-object Supabase row')
  }
  return row as Record<string, unknown>
}

// ── Route-level error response helper ─────────────────────────────────────────

/**
 * Converts a caught error into a JSON 500 response, logging the message.
 * Useful at the top of API route catch blocks.
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
