// lib/storage/deleteFile.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY delete helpers for Supabase Storage.
// Always uses the service-role client — the calling API route must confirm
// the user is authorized (owner/admin for the tenant) before calling.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { assertSafeStoragePath, type StorageBucket } from '@/lib/storage/buckets'

// ─── Delete a single file ─────────────────────────────────────────────────────

/**
 * Deletes a single file from a storage bucket.
 *
 * @param bucket - Target bucket.
 * @param path   - Full storage path of the object.
 * @returns `true` on success, `false` on a soft failure (file not found, etc.).
 * @throws  on unexpected errors.
 */
export async function deleteFile(
  bucket: StorageBucket,
  path: string,
): Promise<boolean> {
  assertSafeStoragePath(path)
  const supabase = getSupabaseServerClient()
  const { error } = await supabase.storage.from(bucket).remove([path])

  if (error) {
    if (
      error.message.toLowerCase().includes('not found') ||
      error.message.toLowerCase().includes('no such')
    ) {
      return false
    }
    throw new Error(`[storage:deleteFile] Failed to delete "${path}" from "${bucket}": ${error.message}`)
  }
  return true
}

// ─── Delete multiple files ───────────────────────────────────────────────────

/**
 * Deletes multiple files from a bucket in one request.
 *
 * @param bucket - Target bucket.
 * @param paths  - Array of full storage paths.
 * @returns number of successfully deleted objects.
 */
export async function deleteFiles(
  bucket: StorageBucket,
  paths: string[],
): Promise<number> {
  if (!paths.length) return 0
  paths.forEach(assertSafeStoragePath)

  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.storage.from(bucket).remove(paths)

  if (error) {
    throw new Error(`[storage:deleteFiles] Batch delete failed in "${bucket}": ${error.message}`)
  }

  return data?.length ?? 0
}

// ─── Delete all files under a prefix ─────────────────────────────────────────

/**
 * Deletes all objects whose path starts with `prefix` in the given bucket.
 * Fetches up to 1 000 objects per page (Supabase default limit).
 *
 * @param bucket - Target bucket.
 * @param prefix - Path prefix, e.g. `'tenants/abc/360/product-id/pkg-id/'`.
 * @returns total number of deleted objects.
 */
export async function deleteFilesByPrefix(
  bucket: StorageBucket,
  prefix: string,
): Promise<number> {
  assertSafeStoragePath(prefix)
  const supabase = getSupabaseServerClient()
  let totalDeleted = 0

  // Paginate in case there are more than 1 000 frames/files.
  while (true) {
    const { data: listed, error: listErr } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 1000 })

    if (listErr) {
      throw new Error(`[storage:deleteFilesByPrefix] list failed — prefix="${prefix}": ${listErr.message}`)
    }
    if (!listed?.length) break

    const paths = listed.map(f => `${prefix}${f.name}`)
    const { data: removed, error: removeErr } = await supabase.storage
      .from(bucket)
      .remove(paths)

    if (removeErr) {
      throw new Error(`[storage:deleteFilesByPrefix] remove failed — bucket="${bucket}": ${removeErr.message}`)
    }
    totalDeleted += removed?.length ?? 0

    // If fewer results than the limit, we've consumed all pages.
    if (listed.length < 1000) break
  }

  return totalDeleted
}
