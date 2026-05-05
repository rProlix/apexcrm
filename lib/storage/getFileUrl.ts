// lib/storage/getFileUrl.ts
// ─────────────────────────────────────────────────────────────────────────────
// URL helpers for Supabase Storage objects.
//
// Rules:
//  - Public buckets  → getPublicFileUrl()  (no auth required to view)
//  - Private buckets → createSignedFileUrl() (time-limited signed URL)
//  - Never generate a public URL for a private bucket.
//
// This file is safe to import from server components and route handlers.
// The underlying Supabase client calls are synchronous (getPublicUrl) or
// async (createSignedUrl).
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { isPublicBucket, type StorageBucket } from '@/lib/storage/buckets'

// ─── Public URL ───────────────────────────────────────────────────────────────

/**
 * Returns the permanent public CDN URL for an object in a **public** bucket.
 *
 * Throws if called with a private bucket — use `createSignedFileUrl` instead.
 */
export function getPublicFileUrl(bucket: StorageBucket, path: string): string {
  if (!isPublicBucket(bucket)) {
    throw new Error(
      `getPublicFileUrl: "${bucket}" is a private bucket. ` +
      `Use createSignedFileUrl() for private buckets.`,
    )
  }
  const supabase = getSupabaseServerClient()
  const { data } = supabase.storage.from(bucket).getPublicUrl(path)
  return data.publicUrl
}

// ─── Signed URL ───────────────────────────────────────────────────────────────

/**
 * Creates a time-limited signed URL for an object in any bucket.
 *
 * Use this for private buckets or whenever you want the URL to expire.
 *
 * @param bucket         - Bucket name from STORAGE_BUCKETS.
 * @param path           - Full storage path of the object.
 * @param expiresInSeconds - Default 3600 (1 hour). Max ~604800 (7 days).
 */
export async function createSignedFileUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const supabase = getSupabaseServerClient()
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds)

  if (error || !data?.signedUrl) {
    throw new Error(
      `createSignedFileUrl: Failed to sign "${path}" in "${bucket}": ${error?.message ?? 'unknown error'}`,
    )
  }

  return data.signedUrl
}

/**
 * Returns the best URL for the given bucket:
 * - Public bucket → permanent public URL (fast, no expiry)
 * - Private bucket → signed URL (expires in `expiresInSeconds`)
 *
 * Useful when you want one call that handles both cases transparently.
 */
export async function getFileUrl(
  bucket: StorageBucket,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  if (isPublicBucket(bucket)) {
    return getPublicFileUrl(bucket, path)
  }
  return createSignedFileUrl(bucket, path, expiresInSeconds)
}
