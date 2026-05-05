// lib/services/spin-generator/generate360Package.ts
//
// Generation pipeline for the product_360_spin module.
// Writes frames into product_360_frames (per-row) rather than a JSONB array.
// This enables incremental progress tracking and selective frame retries.

import { getSupabaseServerClient }                 from '@/lib/supabase/server'
import { generateImage }                           from '@/lib/services/midjourney/client'
import { build360FramePrompt, buildAngleSequence } from './generate360'
import { STORAGE_BUCKETS }                         from '@/lib/storage/buckets'

const BUCKET = STORAGE_BUCKETS.SPIN_360_ASSETS

// ─── Storage ─────────────────────────────────────────────────────────────────

async function uploadPackageFrame(
  tenantId:    string,
  packageId:   string,
  frameIndex:  number,
  sourceUrl:   string,
): Promise<string> {
  const supabase = getSupabaseServerClient()
  const res      = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch frame (${res.status}): ${sourceUrl}`)

  const buffer = await res.arrayBuffer()
  const label  = String(frameIndex + 1).padStart(3, '0')
  const path   = `tenants/${tenantId}/360/${packageId}/frame_${label}.png`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(buffer), { contentType: 'image/png', upsert: true })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

// ─── Result type ─────────────────────────────────────────────────────────────

export interface GeneratePackageResult {
  success:     boolean
  package_id:  string
  frame_count: number
  error?:      string
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

const MAX_RETRIES = 2

/**
 * Runs the full 360° generation pipeline for a product_360_packages record.
 *
 * For each angle:
 *   1. Builds the Midjourney prompt with angle-lock descriptors
 *   2. Generates the image via ImagineAPI (Midjourney proxy)
 *   3. Uploads the result to Supabase Storage (spin-360-assets bucket)
 *   4. Inserts a row into product_360_frames immediately for live progress
 *
 * Skips frames already in product_360_frames (safe for retries).
 * Updates package status to "complete" when all frames are done.
 */
export async function generatePackage360(packageId: string): Promise<GeneratePackageResult> {
  const supabase = getSupabaseServerClient()

  const { data: pkg, error: loadErr } = await supabase
    .from('product_360_packages')
    .select('*')
    .eq('id', packageId)
    .single()

  if (loadErr || !pkg) {
    return { success: false, package_id: packageId, frame_count: 0, error: 'Package not found' }
  }

  // Mark generating
  await supabase
    .from('product_360_packages')
    .update({ status: 'generating', error_message: null })
    .eq('id', packageId)

  // Load already-done frames to support resume
  const { data: existingFrames } = await supabase
    .from('product_360_frames')
    .select('frame_index')
    .eq('package_id', packageId)

  const doneSet = new Set((existingFrames ?? []).map(f => f.frame_index))
  const angles  = buildAngleSequence(pkg.frame_count)
  let framesDone = doneSet.size

  for (let i = 0; i < angles.length; i++) {
    if (doneSet.has(i)) continue

    const prompt  = build360FramePrompt(pkg.prompt ?? pkg.name ?? 'product', angles[i])
    let publicUrl = ''
    let lastError = ''

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await generateImage(prompt)
        if (result.status !== 'completed' || !result.image_url) {
          lastError = `ImagineAPI returned non-completed status for frame ${i + 1}`
          continue
        }
        publicUrl = await uploadPackageFrame(pkg.tenant_id, packageId, i, result.image_url)
        lastError = ''
        break
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.error(`[generatePackage360] frame ${i + 1} attempt ${attempt} failed:`, lastError)
      }
    }

    if (!publicUrl) {
      await supabase
        .from('product_360_packages')
        .update({ status: 'failed', error_message: `Frame ${i + 1} failed: ${lastError}` })
        .eq('id', packageId)
      return { success: false, package_id: packageId, frame_count: framesDone, error: lastError }
    }

    // Insert frame row
    await supabase.from('product_360_frames').insert({
      package_id:   packageId,
      frame_index:  i,
      image_url:    publicUrl,
      storage_path: `tenants/${pkg.tenant_id}/360/${packageId}/frame_${String(i + 1).padStart(3, '0')}.png`,
    })
    framesDone++
  }

  // All frames done
  await supabase
    .from('product_360_packages')
    .update({ status: 'complete', error_message: null })
    .eq('id', packageId)

  return { success: true, package_id: packageId, frame_count: framesDone }
}
