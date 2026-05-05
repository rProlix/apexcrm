// lib/product-360/finalize.ts
// Finalizes a 360° package after all frames have been generated and uploaded.
//
// Responsibilities:
//   1. Count actual frame rows in product_360_frames
//   2. Verify each frame has a usable image_url
//   3. Choose a preview thumbnail (middle frame, else first valid frame)
//   4. Update the package row: status='ready', preview_image_url, frames_done,
//      progress_percent=100, last_generated_at, cover_frame_url (compat)
//
// SERVER-ONLY. Never import from client components.

import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface FinalizeResult {
  success:      boolean
  previewUrl:   string | null
  frameCount:   number
  errorMessage?: string
}

/**
 * Finalize a 360° package after generation completes.
 * Called by generatePackage() after all frames are uploaded.
 */
export async function finalizePackage(packageId: string): Promise<FinalizeResult> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const tag = `[p360:finalize] pkg=${packageId}`

  // ── Load package metadata ────────────────────────────────────────────────
  const { data: pkg } = await db
    .from('product_360_packages')
    .select('id, tenant_id, target_frame_count, status')
    .eq('id', packageId)
    .maybeSingle()

  if (!pkg) {
    console.error(`${tag} package not found`)
    return { success: false, previewUrl: null, frameCount: 0, errorMessage: 'Package not found' }
  }

  const targetFrameCount = (pkg.target_frame_count as number) ?? 0

  // ── Load all frames ordered by frame_index ───────────────────────────────
  const { data: frames, error: framesErr } = await db
    .from('product_360_frames')
    .select('id, frame_index, image_url, storage_path')
    .eq('package_id', packageId)
    .order('frame_index', { ascending: true })

  if (framesErr) {
    const msg = `Failed to load frames: ${framesErr.message}`
    console.error(`${tag} ${msg}`)
    await markPackageFailed(packageId, msg)
    return { success: false, previewUrl: null, frameCount: 0, errorMessage: msg }
  }

  const allFrames = (frames ?? []) as Array<{
    id: string
    frame_index: number
    image_url: string | null
    storage_path: string | null
  }>

  const validFrames = allFrames.filter(f => !!f.image_url)
  const frameCount  = allFrames.length

  // ── Validate ─────────────────────────────────────────────────────────────
  if (frameCount === 0) {
    const msg = 'Generated frames missing from database'
    console.error(`${tag} ${msg}`)
    await markPackageFailed(packageId, msg)
    return { success: false, previewUrl: null, frameCount: 0, errorMessage: msg }
  }

  if (validFrames.length === 0) {
    const msg = 'No valid frame URLs found — storage upload may have failed'
    console.error(`${tag} ${msg}`)
    await markPackageFailed(packageId, msg)
    return { success: false, previewUrl: null, frameCount, errorMessage: msg }
  }

  if (targetFrameCount > 0 && frameCount < targetFrameCount) {
    // Allow partial completion: log a warning but still mark ready with the actual count
    console.warn(`${tag} Expected ${targetFrameCount} frames but found ${frameCount} — marking ready with partial set`)
  }

  // ── Choose preview frame (middle frame or first valid) ───────────────────
  const midIdx     = Math.floor(validFrames.length / 2)
  const previewFrame = validFrames[midIdx] ?? validFrames[0]
  const previewUrl   = previewFrame?.image_url ?? null

  console.info(`${tag} finalizing: ${frameCount} frames, preview=${previewUrl?.slice(0, 80)}…`)

  // ── Update package ───────────────────────────────────────────────────────
  const { error: updateErr } = await db
    .from('product_360_packages')
    .update({
      status:            'ready',
      frames_done:       frameCount,
      progress_percent:  100,
      preview_image_url: previewUrl,
      cover_frame_url:   previewUrl,   // backward-compat
      last_generated_at: new Date().toISOString(),
      generation_error:  null,
      updated_at:        new Date().toISOString(),
    })
    .eq('id', packageId)

  if (updateErr) {
    const msg = `Failed to update package to ready: ${updateErr.message}`
    console.error(`${tag} ${msg}`)
    return { success: false, previewUrl, frameCount, errorMessage: msg }
  }

  console.info(`${tag} → ready (${frameCount} frames, preview set)`)
  return { success: true, previewUrl, frameCount }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function markPackageFailed(packageId: string, errorMessage: string): Promise<void> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('product_360_packages')
    .update({
      status:           'failed',
      generation_error: errorMessage,
      updated_at:       new Date().toISOString(),
    })
    .eq('id', packageId)
}
