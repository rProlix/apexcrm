// lib/360/storage.ts
// Supabase Storage helpers for the product_360_spin module.
// All frames live in the `product-360-spins` bucket.
//
// Path format: {tenantId}/{packageId}/frame_{frameIndex:02d}.png
//
// IMPORTANT: these helpers run on the server only.
// Never import this file from a client component.

import { getSupabaseServerClient } from '@/lib/supabase/server'

export const BUCKET = 'product-360-spins'

// ─── Path helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the canonical storage path for a frame.
 * Uses zero-padded two-digit index for correct alphabetical sort.
 */
export function get360FramePath(
  tenantId:   string,
  packageId:  string,
  frameIndex: number,
): string {
  const padded = String(frameIndex).padStart(3, '0')
  return `${tenantId}/${packageId}/frame_${padded}.png`
}

// ─── Public URL ───────────────────────────────────────────────────────────────

/**
 * Returns the public URL for a given storage path in the product-360-spins bucket.
 * Does NOT verify the bucket exists — use gracefully.
 */
export function get360PublicUrl(storagePath: string): string {
  const supabase = getSupabaseServerClient()
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface Upload360FrameParams {
  tenantId:    string
  packageId:   string
  frameIndex:  number
  /** Raw binary buffer (PNG/JPG) */
  buffer:      Uint8Array | ArrayBuffer
  contentType?: string
}

export interface Upload360FrameResult {
  imageUrl:    string
  storagePath: string
}

/**
 * Uploads a frame buffer to Supabase Storage.
 * Returns the public URL and storage path on success.
 * Throws with a descriptive message if the bucket is missing or upload fails.
 */
export async function upload360Frame(
  params: Upload360FrameParams,
): Promise<Upload360FrameResult> {
  const { tenantId, packageId, frameIndex, buffer, contentType = 'image/png' } = params
  const supabase    = getSupabaseServerClient()
  const storagePath = get360FramePath(tenantId, packageId, frameIndex)

  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, data, { contentType, upsert: true })

  if (error) {
    if (error.message.toLowerCase().includes('bucket') || error.message.toLowerCase().includes('not found')) {
      throw new Error(`Storage bucket "${BUCKET}" is not configured. Please create it in Supabase Storage.`)
    }
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  const imageUrl = get360PublicUrl(storagePath)
  return { imageUrl, storagePath }
}

/**
 * Fetches a remote image URL and uploads it as a frame.
 * Used by the AI generation pipeline.
 */
export async function fetchAndUpload360Frame(params: {
  tenantId:   string
  packageId:  string
  frameIndex: number
  sourceUrl:  string
}): Promise<Upload360FrameResult> {
  const { sourceUrl, ...rest } = params
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch frame from source (HTTP ${res.status}): ${sourceUrl}`)
  }
  const buffer = await res.arrayBuffer()
  return upload360Frame({ ...rest, buffer })
}

// ─── Delete ───────────────────────────────────────────────────────────────────

/**
 * Deletes all storage files for a package.
 * Non-fatal: logs a warning if the bucket is missing or delete fails.
 * Returns true on success, false on soft failure.
 */
export async function delete360PackageStorage(
  tenantId:  string,
  packageId: string,
): Promise<boolean> {
  try {
    const supabase = getSupabaseServerClient()
    const prefix   = `${tenantId}/${packageId}/`

    const { data, error: listErr } = await supabase.storage.from(BUCKET).list(prefix)
    if (listErr) {
      console.warn(`[delete360PackageStorage] list failed: ${listErr.message}`)
      return false
    }
    if (!data?.length) return true

    const paths = data.map(f => `${prefix}${f.name}`)
    const { error: delErr } = await supabase.storage.from(BUCKET).remove(paths)
    if (delErr) {
      console.warn(`[delete360PackageStorage] remove failed: ${delErr.message}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[delete360PackageStorage] unexpected error:', err)
    return false
  }
}
