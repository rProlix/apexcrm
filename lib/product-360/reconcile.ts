// lib/product-360/reconcile.ts
// Reconciles a package's progress counter against actual frame rows in DB.
// Used for:
//   - Auto-healing packages stuck in queued/generating after a function timeout
//   - Recovery endpoint for manual admin repair
//   - Self-healing in the generation-status polling endpoint (with safeguards)
//
// SERVER-ONLY. Never import from client components.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { finalizePackage }          from './finalize'

export interface ReconcileResult {
  frameCount:   number
  targetCount:  number
  progressPct:  number
  wasStuck:     boolean
  finalized:    boolean
  errorMessage?: string
}

const STUCK_THRESHOLD_MS = 10 * 60 * 1000 // 10 minutes

/**
 * Reconcile a package's progress against actual DB frame rows.
 *
 * - Counts frame rows in product_360_frames
 * - Updates frames_done and progress_percent in the package row
 * - If the package is stuck (stale status + frames match target), calls finalizePackage
 *
 * @param packageId  The package UUID
 * @param force      If true, finalize even if updated_at is recent (for manual recovery)
 */
export async function reconcilePackageProgress(
  packageId: string,
  force = false,
): Promise<ReconcileResult> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const tag = `[p360:reconcile] pkg=${packageId}`

  // ── Load package ─────────────────────────────────────────────────────────
  const { data: pkg } = await db
    .from('product_360_packages')
    .select('id, status, target_frame_count, frames_done, progress_percent, updated_at')
    .eq('id', packageId)
    .maybeSingle()

  if (!pkg) {
    return { frameCount: 0, targetCount: 0, progressPct: 0, wasStuck: false, finalized: false, errorMessage: 'Package not found' }
  }

  const currentStatus  = pkg.status as string
  const targetCount    = (pkg.target_frame_count as number) ?? 0
  const updatedAt      = new Date(pkg.updated_at as string).getTime()
  const msSinceUpdate  = Date.now() - updatedAt

  // ── Count actual frame rows ───────────────────────────────────────────────
  const { count: frameCount } = await db
    .from('product_360_frames')
    .select('*', { count: 'exact', head: true })
    .eq('package_id', packageId)

  const actualCount  = frameCount ?? 0
  const progressPct  = targetCount > 0 ? Math.min(100, Math.round((actualCount / targetCount) * 100)) : 0

  console.info(`${tag} status=${currentStatus} frames=${actualCount}/${targetCount} age=${Math.round(msSinceUpdate / 1000)}s`)

  // ── Update frames_done and progress_percent ───────────────────────────────
  const needsProgressUpdate =
    (pkg.frames_done as number) !== actualCount ||
    (pkg.progress_percent as number) !== progressPct

  if (needsProgressUpdate) {
    await db
      .from('product_360_packages')
      .update({
        frames_done:      actualCount,
        progress_percent: progressPct,
        updated_at:       new Date().toISOString(),
      })
      .eq('id', packageId)
  }

  // ── Determine if this package is stuck ────────────────────────────────────
  const inProgressStatus = ['queued', 'generating', 'processing'].includes(currentStatus)
  const isStale          = force || msSinceUpdate > STUCK_THRESHOLD_MS
  const framesMatch      = targetCount > 0 && actualCount >= targetCount

  if (!inProgressStatus) {
    // Already terminal — nothing to do beyond syncing counters
    return { frameCount: actualCount, targetCount, progressPct, wasStuck: false, finalized: false }
  }

  const wasStuck = isStale && (framesMatch || progressPct >= 100)

  if (wasStuck) {
    console.warn(`${tag} package is stuck (${currentStatus}, ${actualCount}/${targetCount} frames, ${Math.round(msSinceUpdate / 1000)}s old) — finalizing`)
    const fin = await finalizePackage(packageId)
    return {
      frameCount:    fin.frameCount,
      targetCount,
      progressPct:   100,
      wasStuck:      true,
      finalized:     fin.success,
      errorMessage:  fin.errorMessage,
    }
  }

  if (force && actualCount > 0) {
    // Manual recovery: force finalize even if frames don't fully match
    console.warn(`${tag} forced finalize: ${actualCount}/${targetCount} frames`)
    const fin = await finalizePackage(packageId)
    return {
      frameCount:   fin.frameCount,
      targetCount,
      progressPct:  100,
      wasStuck:     true,
      finalized:    fin.success,
      errorMessage: fin.errorMessage,
    }
  }

  return { frameCount: actualCount, targetCount, progressPct, wasStuck: false, finalized: false }
}

/**
 * Find and recover ALL stuck packages for a tenant.
 * A package is "stuck" if it has been in queued/generating/processing
 * for more than STUCK_THRESHOLD_MS and frames_done >= target or progress_percent >= 100.
 */
export async function recoverStuckPackages(tenantId: string): Promise<{
  checked: number
  recovered: number
  errors: string[]
}> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const cutoff = new Date(Date.now() - STUCK_THRESHOLD_MS).toISOString()

  const { data: stuckPkgs } = await db
    .from('product_360_packages')
    .select('id, status, frames_done, target_frame_count, progress_percent, updated_at')
    .eq('tenant_id', tenantId)
    .in('status', ['queued', 'generating', 'processing'])
    .lt('updated_at', cutoff)

  const pkgs   = (stuckPkgs ?? []) as Array<{ id: string }>
  const errors: string[] = []
  let recovered = 0

  for (const pkg of pkgs) {
    const result = await reconcilePackageProgress(pkg.id, true)
    if (result.finalized) recovered++
    if (result.errorMessage) errors.push(`${pkg.id}: ${result.errorMessage}`)
  }

  return { checked: pkgs.length, recovered, errors }
}
