// lib/website-ai/planConstraintErrors.ts
// Helpers for detecting Postgres CHECK constraint violations in website_image_plans.

/** Postgres error code for CHECK constraint violations */
const POSTGRES_CHECK_VIOLATION = '23514'

/** The exact constraint name that guards aspect_ratio */
export const ASPECT_RATIO_CONSTRAINT_NAME = 'website_image_plans_aspect_ratio_check'

/** The exact constraint name that guards status */
export const STATUS_CONSTRAINT_NAME = 'website_image_plans_status_check'

/**
 * Returns true when the Supabase error is a Postgres CHECK constraint violation.
 * Optionally narrow to a specific constraint name.
 */
export function isCheckConstraintError(
  err: { message?: string; code?: string } | null | undefined,
  constraintName?: string,
): boolean {
  if (!err) return false
  if (err.code !== POSTGRES_CHECK_VIOLATION && !err.message?.includes('violates check constraint')) return false
  if (constraintName) {
    return (err.message ?? '').includes(constraintName)
  }
  return true
}

/**
 * Returns true when the error is specifically an aspect_ratio CHECK violation.
 */
export function isAspectRatioConstraintError(
  err: { message?: string; code?: string } | null | undefined,
): boolean {
  return isCheckConstraintError(err, ASPECT_RATIO_CONSTRAINT_NAME)
}
