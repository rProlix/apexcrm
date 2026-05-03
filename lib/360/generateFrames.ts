// lib/360/generateFrames.ts
// AI generation pipeline for the product_360_spin module.
//
// Writes frames into product_360_frames (one row per angle) for incremental
// progress tracking. Updates package status throughout.
//
// IMPORTANT: This file runs on the server only (Vercel Fluid Compute).
// Do NOT import it from client components.

import { getSupabaseServerClient }   from '@/lib/supabase/server'
import { generateImageForAngle }     from './providers/midjourney'
import { fetchAndUpload360Frame }    from './storage'

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Canonical prompt template for a single 360° frame.
 * Every frame uses identical camera/lighting/scale descriptors —
 * only the rotation angle changes.
 */
export function build360FramePrompt(productDescription: string, angleDegrees: number): string {
  return (
    `Ultra-realistic professional product photography of: "${productDescription}". ` +
    `Object centered, isolated clean studio background, identical camera distance, ` +
    `identical scale, identical lighting, identical lens, identical framing, ` +
    `6K sharp detail, realistic texture, premium commercial product photo. ` +
    `Rotate the product/object to exactly ${angleDegrees} degrees. ` +
    `Do not change the object, ingredients, colors, size, shape, labels, toppings, packaging, or background. ` +
    `No extra objects. No hands. No text overlays. No distortion. ` +
    `--ar 1:1 --q 2 --style raw`
  )
}

/**
 * Returns an array of evenly-spaced angles across 360°.
 * frameCount=24 → [0, 15, 30, ... 345]
 */
export function buildAngleSequence(frameCount: number): number[] {
  const step = 360 / frameCount
  return Array.from({ length: frameCount }, (_, i) => Math.round(i * step))
}

// ─── Generation result ────────────────────────────────────────────────────────

export interface GeneratePackageResult {
  success:     boolean
  packageId:   string
  frameCount:  number
  error?:      string
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

const MAX_RETRIES = 2

/**
 * Runs the full 360° AI generation pipeline for a product_360_packages record.
 *
 * For each angle:
 *   1. Builds the Midjourney prompt with angle-lock descriptors
 *   2. Calls ImagineAPI (Midjourney proxy)
 *   3. Fetches the result image and uploads to Supabase Storage
 *   4. Inserts a product_360_frames row immediately (live progress)
 *
 * Skips already-completed frames (safe for retries).
 * Updates package.status throughout:
 *   → generating while running
 *   → ready when all frames complete
 *   → failed if any frame fails after MAX_RETRIES
 *
 * If IMAGINE_API_TOKEN is not set, sets status = 'failed' with a readable message.
 */
export async function generatePackage360(packageId: string): Promise<GeneratePackageResult> {
  const supabase = getSupabaseServerClient()

  const { data: pkg, error: loadErr } = await supabase
    .from('product_360_packages')
    .select('id, tenant_id, product_id, name, prompt, frame_count, status')
    .eq('id', packageId)
    .single()

  if (loadErr || !pkg) {
    return { success: false, packageId, frameCount: 0, error: 'Package not found' }
  }

  // Mark generating
  await supabase
    .from('product_360_packages')
    .update({ status: 'generating', error_message: null })
    .eq('id', packageId)

  // Load already-completed frames (resume support)
  const { data: existingFrames } = await supabase
    .from('product_360_frames')
    .select('frame_index')
    .eq('package_id', packageId)

  const doneSet    = new Set((existingFrames ?? []).map(f => f.frame_index as number))
  const angles     = buildAngleSequence(pkg.frame_count)
  let   framesDone = doneSet.size

  // Resolve description from prompt or product name
  const description = pkg.prompt?.trim() || (pkg.name ?? 'product')

  for (let i = 0; i < angles.length; i++) {
    if (doneSet.has(i)) continue

    const angle   = angles[i]
    const prompt  = build360FramePrompt(description, angle)
    let publicUrl = ''
    let lastError = ''

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await generateImageForAngle({ prompt })
        const { imageUrl, storagePath } = await fetchAndUpload360Frame({
          tenantId:   pkg.tenant_id,
          packageId,
          frameIndex: i,
          sourceUrl:  result.imageUrl,
        })
        publicUrl = imageUrl

        // Insert frame row for live progress
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('product_360_frames').upsert({
          package_id:    packageId,
          tenant_id:     pkg.tenant_id,
          frame_index:   i,
          angle_degrees: angle,
          image_url:     imageUrl,
          storage_path:  storagePath,
        }, { onConflict: 'package_id,frame_index' })

        // Update cover_image_url from frame 0
        if (i === 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any)
            .from('product_360_packages')
            .update({ cover_image_url: imageUrl })
            .eq('id', packageId)
        }

        lastError = ''
        break
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.error(`[generatePackage360] frame ${i} attempt ${attempt} failed:`, lastError)
      }
    }

    if (!publicUrl) {
      const errorMessage = lastError.includes('not configured')
        ? lastError
        : `Frame ${i + 1}/${angles.length} failed after ${MAX_RETRIES + 1} attempts: ${lastError}`

      await supabase
        .from('product_360_packages')
        .update({ status: 'failed', error_message: errorMessage })
        .eq('id', packageId)

      return { success: false, packageId, frameCount: framesDone, error: errorMessage }
    }

    framesDone++
  }

  // All frames done — mark ready
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('product_360_packages')
    .update({ status: 'ready', error_message: null })
    .eq('id', packageId)

  return { success: true, packageId, frameCount: framesDone }
}
