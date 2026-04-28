// lib/services/spin-generator/generator.ts
// Core orchestration pipeline for generating a 360° spin package.
//
// Flow:
//  1. Mark package as "generating"
//  2. Build angle prompts
//  3. For each frame: generate via Midjourney → upload to Storage → save spin_image row
//  4. Mark package as "ready"
//  5. On any unrecoverable error: mark package as "failed"

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { buildAnglePrompts }       from '@/lib/services/midjourney/prompts'
import { generateImage }           from '@/lib/services/midjourney/client'
import { storeFrameFromUrl }       from './storage'
import type { GenerateSpinPackageResult } from '@/types/spin-packages'

const MAX_RETRIES_PER_FRAME = 2

/**
 * Runs the full generation pipeline for a spin package that is already saved
 * in the database with status = "draft" or "failed".
 *
 * This function is intended to be called from an API route handler.
 * It is intentionally synchronous-looking (async/await chain) so it can run
 * inside a Vercel Function (Fluid Compute) with a generous timeout.
 * For very large image_count values (> 36) consider offloading to a queue.
 */
export async function runSpinGeneration(
  packageId: string,
): Promise<GenerateSpinPackageResult> {
  const supabase = getSupabaseServerClient()

  // ── Load package ──────────────────────────────────────────────────────────
  const { data: pkg, error: loadErr } = await supabase
    .from('spin_packages')
    .select('*')
    .eq('id', packageId)
    .single()

  if (loadErr || !pkg) {
    return { success: false, package_id: packageId, frame_count: 0, error: 'Package not found' }
  }

  // ── Mark as generating ────────────────────────────────────────────────────
  await supabase
    .from('spin_packages')
    .update({ status: 'generating', error_message: null })
    .eq('id', packageId)

  const anglePrompts = buildAnglePrompts(pkg.prompt_text, pkg.image_count)
  let completedFrames = 0

  for (const { frame_index, prompt } of anglePrompts) {
    // Skip frames that are already stored (allows resuming failed runs)
    const { data: existing } = await supabase
      .from('spin_images')
      .select('id')
      .eq('spin_package_id', packageId)
      .eq('frame_index', frame_index)
      .maybeSingle()

    if (existing) {
      completedFrames++
      continue
    }

    let lastError: string | null = null

    for (let attempt = 0; attempt <= MAX_RETRIES_PER_FRAME; attempt++) {
      try {
        // Generate via Midjourney (blocks until complete)
        const result = await generateImage(prompt)
        if (result.status !== 'completed' || !result.image_url) {
          lastError = `Midjourney generation failed for frame ${frame_index}`
          continue
        }

        // Upload to Supabase Storage
        const { publicUrl, storagePath } = await storeFrameFromUrl(
          pkg.tenant_id,
          pkg.product_id,
          packageId,
          frame_index,
          result.image_url,
        )

        // Persist spin_image row
        const { error: insertErr } = await supabase
          .from('spin_images')
          .insert({
            spin_package_id: packageId,
            tenant_id:       pkg.tenant_id,
            image_url:       publicUrl,
            storage_path:    storagePath,
            frame_index,
          })

        if (insertErr) {
          lastError = `DB insert failed for frame ${frame_index}: ${insertErr.message}`
          continue
        }

        completedFrames++
        lastError = null
        break // success — move to next frame
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.error(`[spin-generator] frame ${frame_index} attempt ${attempt} failed:`, lastError)
      }
    }

    if (lastError) {
      // A frame failed after all retries — mark package as failed and bail
      await supabase
        .from('spin_packages')
        .update({
          status:        'failed',
          error_message: `Frame ${frame_index} failed: ${lastError}`,
        })
        .eq('id', packageId)

      return {
        success:     false,
        package_id:  packageId,
        frame_count: completedFrames,
        error:       `Frame ${frame_index} failed after ${MAX_RETRIES_PER_FRAME + 1} attempts`,
      }
    }
  }

  // ── All frames done — mark ready ──────────────────────────────────────────
  await supabase
    .from('spin_packages')
    .update({ status: 'ready', error_message: null })
    .eq('id', packageId)

  return { success: true, package_id: packageId, frame_count: completedFrames }
}

/**
 * Finds any missing frames for a package and regenerates only those.
 * Useful when partial failures leave some frames stored but others missing.
 */
export async function repairMissingFrames(packageId: string): Promise<GenerateSpinPackageResult> {
  const supabase = getSupabaseServerClient()

  const { data: pkg } = await supabase
    .from('spin_packages')
    .select('*')
    .eq('id', packageId)
    .single()

  if (!pkg) return { success: false, package_id: packageId, frame_count: 0, error: 'Package not found' }

  const { data: existingImages } = await supabase
    .from('spin_images')
    .select('frame_index')
    .eq('spin_package_id', packageId)

  const existing   = new Set((existingImages ?? []).map(r => r.frame_index))
  const allIndices = Array.from({ length: pkg.image_count }, (_, i) => i)
  const missing    = allIndices.filter(i => !existing.has(i))

  if (missing.length === 0) {
    // Nothing missing — ensure status is ready
    await supabase
      .from('spin_packages')
      .update({ status: 'ready', error_message: null })
      .eq('id', packageId)
    return { success: true, package_id: packageId, frame_count: pkg.image_count }
  }

  // Delegate to the main generation pipeline which skips already-completed frames
  return runSpinGeneration(packageId)
}
