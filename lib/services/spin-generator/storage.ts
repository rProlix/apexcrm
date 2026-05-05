// lib/services/spin-generator/storage.ts
// Supabase Storage helpers for the spin-360-assets bucket.
//
// Path convention:
//   tenants/{tenantId}/360/{productId}/{spinPackageId}/frame_{NNN}.jpg

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { STORAGE_BUCKETS }         from '@/lib/storage/buckets'

const BUCKET = STORAGE_BUCKETS.SPIN_360_ASSETS

/**
 * Downloads an image from an external URL and uploads it to Supabase Storage.
 * Returns the permanent public URL.
 */
export async function storeFrameFromUrl(
  tenantId:      string,
  productId:     string,
  packageId:     string,
  frameIndex:    number,
  sourceUrl:     string,
): Promise<{ publicUrl: string; storagePath: string }> {
  const supabase = getSupabaseServerClient()

  // Fetch the generated image bytes
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch frame image (${res.status}): ${sourceUrl}`)
  }
  const buffer      = await res.arrayBuffer()
  const uint8Array  = new Uint8Array(buffer)
  const frameLabel  = String(frameIndex).padStart(3, '0')
  const storagePath = `tenants/${tenantId}/360/${productId}/${packageId}/frame_${frameLabel}.jpg`

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, uint8Array, {
      contentType:  'image/jpeg',
      upsert:       true,
    })

  if (error) {
    throw new Error(`Supabase Storage upload failed for ${storagePath}: ${error.message}`)
  }

  const { data: { publicUrl } } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(storagePath)

  return { publicUrl, storagePath }
}

/**
 * Deletes all stored frames for a spin package from Supabase Storage.
 */
export async function deletePackageFrames(
  tenantId:  string,
  productId: string,
  packageId: string,
): Promise<void> {
  const supabase    = getSupabaseServerClient()
  const prefix      = `tenants/${tenantId}/360/${productId}/${packageId}/`

  const { data: files, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list(prefix)

  if (listErr || !files?.length) return

  const paths = files.map(f => `${prefix}${f.name}`)
  await supabase.storage.from(BUCKET).remove(paths)
}
