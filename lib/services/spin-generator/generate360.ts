// lib/services/spin-generator/generate360.ts
// Generation pipeline for the product_360_spins module.
//
// Produces a JSONB ordered array of public image URLs per spin record.
// Appends URLs progressively so the UI can show live progress while polling.

import { getSupabaseServerClient }    from '@/lib/supabase/server'
import { generateImage }              from '@/lib/services/midjourney/client'
import { STORAGE_BUCKETS }            from '@/lib/storage/buckets'

const BUCKET = STORAGE_BUCKETS.SPIN_360_ASSETS

// ─── Prompt builder ───────────────────────────────────────────────────────────

/**
 * Builds the Midjourney prompt for a single frame.
 * Every frame shares the same base descriptor — only the rotation angle changes.
 * Consistency anchors are injected to prevent geometry/lighting drift.
 */
export function build360FramePrompt(description: string, angleDeg: number): string {
  return (
    `Ultra realistic studio product photography of ${description}, ` +
    `centered, isolated, pure white background, consistent controlled lighting, ` +
    `same scale, same 85mm lens, same framing, same camera height, ` +
    `no shadows, no props, hyper-detailed, 6K quality, professional product shoot, ` +
    `rotational angle ${angleDeg} degrees around vertical axis, ` +
    `no variation in product identity, no distortion, identical lighting setup, ` +
    `--ar 1:1 --q 2 --style raw`
  )
}

/** Returns an array of angles evenly distributed across 360°. */
export function buildAngleSequence(frameCount: number): number[] {
  const step = 360 / frameCount
  return Array.from({ length: frameCount }, (_, i) => Math.round(i * step))
}

// ─── Storage helper ───────────────────────────────────────────────────────────

async function uploadFrame(
  tenantId:   string,
  productId:  string,
  spinId:     string,
  frameIndex: number,
  sourceUrl:  string,
): Promise<string> {
  const supabase  = getSupabaseServerClient()
  const res       = await fetch(sourceUrl)
  if (!res.ok) throw new Error(`Failed to fetch frame (${res.status}): ${sourceUrl}`)

  const buffer  = await res.arrayBuffer()
  const label   = String(frameIndex + 1).padStart(3, '0')
  const path    = `tenants/${tenantId}/360/${productId}/${spinId}/frame_${label}.png`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, new Uint8Array(buffer), { contentType: 'image/png', upsert: true })

  if (error) throw new Error(`Storage upload failed: ${error.message}`)

  const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path)
  return publicUrl
}

// ─── Main pipeline ────────────────────────────────────────────────────────────

const MAX_RETRIES = 2

export interface Generate360Result {
  success:     boolean
  spin_id:     string
  frame_count: number
  error?:      string
}

/**
 * Runs the full 360° generation pipeline for a `product_360_spins` record.
 *
 * Designed to be called from the `/api/ai/generate-360/[id]/run` endpoint.
 * Each frame is:
 *  1. Prompted via Midjourney (with angle-lock descriptors)
 *  2. Downloaded and uploaded to Supabase Storage (spin-360-assets bucket)
 *  3. Appended to `image_urls` in the DB so the UI shows live progress
 *
 * Skips frames whose index already has a URL (safe for retries).
 */
export async function generate360Spin(spinId: string): Promise<Generate360Result> {
  const supabase = getSupabaseServerClient()

  // Load the spin record
  const { data: spin, error: loadErr } = await supabase
    .from('product_360_spins')
    .select('*')
    .eq('id', spinId)
    .single()

  if (loadErr || !spin) {
    return { success: false, spin_id: spinId, frame_count: 0, error: 'Spin record not found' }
  }

  // Mark as generating (idempotent)
  await supabase
    .from('product_360_spins')
    .update({ status: 'generating', error_message: null })
    .eq('id', spinId)

  const angles      = buildAngleSequence(spin.total_frames)
  const currentUrls = Array.isArray(spin.image_urls) ? [...(spin.image_urls as string[])] : []

  for (let i = 0; i < angles.length; i++) {
    // Skip already-generated frames (resume support)
    if (currentUrls[i]) continue

    const prompt   = build360FramePrompt(spin.prompt, angles[i])
    let lastError  = ''
    let publicUrl  = ''

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const result = await generateImage(prompt)
        if (result.status !== 'completed' || !result.image_url) {
          lastError = `Midjourney failed for frame ${i + 1}`
          continue
        }

        publicUrl = await uploadFrame(spin.tenant_id, spin.product_id, spinId, i, result.image_url)
        lastError = ''
        break
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.error(`[generate360] frame ${i + 1} attempt ${attempt} failed:`, lastError)
      }
    }

    if (!publicUrl) {
      await supabase
        .from('product_360_spins')
        .update({ status: 'failed', error_message: `Frame ${i + 1} failed: ${lastError}` })
        .eq('id', spinId)

      return { success: false, spin_id: spinId, frame_count: currentUrls.filter(Boolean).length, error: lastError }
    }

    // Append and persist immediately for live progress
    currentUrls[i] = publicUrl
    await supabase
      .from('product_360_spins')
      .update({ image_urls: currentUrls })
      .eq('id', spinId)
  }

  // All frames complete
  await supabase
    .from('product_360_spins')
    .update({ status: 'ready', error_message: null, image_urls: currentUrls })
    .eq('id', spinId)

  return { success: true, spin_id: spinId, frame_count: currentUrls.length }
}

/**
 * Deletes all stored frames for a spin from Supabase Storage.
 */
export async function delete360SpinFrames(
  tenantId:  string,
  productId: string,
  spinId:    string,
): Promise<void> {
  const supabase = getSupabaseServerClient()
  const prefix   = `tenants/${tenantId}/360/${productId}/${spinId}/`
  const { data }  = await supabase.storage.from(BUCKET).list(prefix)
  if (!data?.length) return
  await supabase.storage.from(BUCKET).remove(data.map(f => `${prefix}${f.name}`))
}
