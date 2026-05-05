// lib/storage/uploadFile.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY upload helper for all Supabase Storage buckets.
// Never import this file from client components.
//
// Always uses the service-role client so the upload bypasses RLS.
// The calling API route is responsible for authorizing the user before
// calling uploadFile().
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import {
  type StorageBucket,
  isPublicBucket,
  assertAllowedMimeType,
  assertFileSizeWithinLimit,
  assertSafeStoragePath,
  sanitizeFileName,
  getTenantPath,
} from '@/lib/storage/buckets'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadFileParams {
  /** Target bucket — must be one of the STORAGE_BUCKETS values. */
  bucket: StorageBucket
  /** UUID of the tenant that owns this file. */
  tenantId: string
  /**
   * Path segments that come after `tenants/{tenantId}/`.
   * e.g. ['website', 'generated', 'planId'] → stored at
   * `tenants/{tenantId}/website/generated/planId/{fileName}`
   */
  pathParts: string[]
  /** Original or desired filename. Will be sanitized automatically. */
  fileName: string
  /** Raw binary content. */
  buffer: Uint8Array | ArrayBuffer | Buffer
  /** MIME type string e.g. 'image/webp'. */
  mimeType: string
  /**
   * Whether to overwrite an existing file at the same path.
   * Defaults to false.
   */
  upsert?: boolean
  /**
   * For private buckets only — if true, a signed URL valid for
   * `signedUrlExpiresIn` seconds is returned alongside the path.
   */
  withSignedUrl?: boolean
  /** Signed URL TTL in seconds. Defaults to 3600 (1 hour). */
  signedUrlExpiresIn?: number
}

export interface UploadFileResult {
  bucket: StorageBucket
  /** Full storage path: `tenants/{tenantId}/.../{fileName}` */
  path: string
  /** Present only for public buckets. */
  publicUrl?: string
  /** Present only when withSignedUrl=true was requested for a private bucket. */
  signedUrl?: string
  mimeType: string
  sizeBytes: number
}

// ─── Main helper ─────────────────────────────────────────────────────────────

/**
 * Uploads a file to the specified Supabase Storage bucket using the service-
 * role client (bypasses RLS).  The calling code is responsible for confirming
 * the user is authorized before invoking this function.
 *
 * Enforces:
 * - Valid bucket name
 * - Tenant ID non-empty
 * - Safe path (no traversal)
 * - Sanitized file name
 * - Allowed MIME type for bucket
 * - File size within bucket limit
 */
export async function uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
  const {
    bucket,
    tenantId,
    pathParts,
    fileName,
    buffer,
    mimeType,
    upsert = false,
    withSignedUrl = false,
    signedUrlExpiresIn = 3600,
  } = params

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!tenantId) throw new Error('uploadFile: tenantId is required')
  assertSafeStoragePath(tenantId)
  pathParts.forEach(assertSafeStoragePath)

  const safeName    = sanitizeFileName(fileName)
  if (!safeName)    throw new Error('uploadFile: fileName is empty after sanitization')

  const data        = buffer instanceof Uint8Array ? buffer : new Uint8Array(
    buffer instanceof ArrayBuffer ? buffer : (buffer as Buffer).buffer,
  )
  const sizeBytes   = data.byteLength

  assertAllowedMimeType(bucket, mimeType)
  assertFileSizeWithinLimit(bucket, sizeBytes)

  // ── Build path ──────────────────────────────────────────────────────────────
  const storagePath = getTenantPath(tenantId, [...pathParts, safeName])

  // ── Upload ──────────────────────────────────────────────────────────────────
  const supabase = getSupabaseServerClient()
  const { error } = await supabase.storage
    .from(bucket)
    .upload(storagePath, data, { contentType: mimeType, upsert })

  if (error) {
    throw new Error(`[storage:uploadFile] Upload failed — bucket="${bucket}" path="${storagePath}": ${error.message}`)
  }

  // ── Build result ────────────────────────────────────────────────────────────
  const result: UploadFileResult = { bucket, path: storagePath, mimeType, sizeBytes }

  if (isPublicBucket(bucket)) {
    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath)
    result.publicUrl = urlData.publicUrl
  } else if (withSignedUrl) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, signedUrlExpiresIn)
    if (signErr) {
      console.warn(`[storage:uploadFile] Could not create signed URL: ${signErr.message}`)
    } else {
      result.signedUrl = signed?.signedUrl
    }
  }

  return result
}
