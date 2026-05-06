// lib/product-360/status.ts
// Canonical status constants for the product_360 module.
// Import from here instead of hardcoding strings throughout the codebase.
//
// IMPORTANT: These values must stay in sync with the DB CHECK constraints
// added by migration 040 / 043.  'cancelled' uses TWO L's everywhere.

// ─── Package statuses ─────────────────────────────────────────────────────────

export const P360_PACKAGE_STATUSES = [
  'draft',
  'queued',
  'planning',
  'generating',
  'processing',
  'paused_quota',
  'ready',
  'completed',
  'failed',
  'cancelled',
  'archived',
] as const

export type P360PackageStatus = (typeof P360_PACKAGE_STATUSES)[number]

/** Statuses that mean the package is actively in the generation pipeline. */
export const ACTIVE_PACKAGE_STATUSES = [
  'queued',
  'planning',
  'generating',
  'processing',
] as const satisfies readonly P360PackageStatus[]

/** Statuses after which no more automatic work will happen without user action. */
export const TERMINAL_PACKAGE_STATUSES = [
  'ready',
  'completed',
  'failed',
  'cancelled',
  'archived',
] as const satisfies readonly P360PackageStatus[]

/**
 * Statuses from which the user can (re-)start generation.
 * Mirrors RESUMABLE_STATUSES in the generate route.
 */
export const RESUMABLE_PACKAGE_STATUSES = [
  'draft',
  'queued',
  'failed',
  'paused_quota',
  'cancelled',
] as const satisfies readonly P360PackageStatus[]

// ─── Frame statuses ───────────────────────────────────────────────────────────

export const P360_FRAME_STATUSES = [
  'pending',
  'queued',
  'generating',
  'completed',
  'failed',
  'cancelled',
  'skipped',
  'archived',
] as const

export type P360FrameStatus = (typeof P360_FRAME_STATUSES)[number]

/** Frame statuses that can be retried (i.e. not yet done and not permanently skipped). */
export const RETRIABLE_FRAME_STATUSES = [
  'pending',
  'queued',
  'failed',
] as const satisfies readonly P360FrameStatus[]

// ─── Normalizers ──────────────────────────────────────────────────────────────

/**
 * Map any legacy/unknown package status string to a valid P360PackageStatus.
 * - 'ready' is kept as-is (it IS a valid status used for public visibility checks)
 * - 'canceled' (one L) → 'cancelled'
 * - anything else unknown → 'failed'
 */
export function normalizePackageStatus(raw: string | null | undefined): P360PackageStatus {
  if (!raw) return 'draft'
  if (raw === 'canceled') return 'cancelled'
  if ((P360_PACKAGE_STATUSES as readonly string[]).includes(raw)) {
    return raw as P360PackageStatus
  }
  return 'failed'
}

/**
 * Map any legacy/unknown frame status string to a valid P360FrameStatus.
 */
export function normalizeFrameStatus(raw: string | null | undefined): P360FrameStatus {
  if (!raw) return 'pending'
  if (raw === 'ready') return 'completed'
  if (raw === 'canceled') return 'cancelled'
  if ((P360_FRAME_STATUSES as readonly string[]).includes(raw)) {
    return raw as P360FrameStatus
  }
  return 'failed'
}

// ─── Predicate helpers ────────────────────────────────────────────────────────

export function isActivePackageStatus(s: string): boolean {
  return (ACTIVE_PACKAGE_STATUSES as readonly string[]).includes(s)
}

export function isTerminalPackageStatus(s: string): boolean {
  return (TERMINAL_PACKAGE_STATUSES as readonly string[]).includes(s)
}

export function isGeneratablePackageStatus(s: string): boolean {
  return (RESUMABLE_PACKAGE_STATUSES as readonly string[]).includes(s)
}

export function isSuccessPackageStatus(s: string): boolean {
  return s === 'ready' || s === 'completed'
}
