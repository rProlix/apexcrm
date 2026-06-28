// lib/pov/media.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY storage helpers for POV Event App guest media uploads.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { STORAGE_BUCKETS, sanitizeFileName, assertSafeStoragePath } from '@/lib/storage/buckets'
import { POV_ALLOWED_MIME, POV_MAX_BYTES, type PovMediaType } from '@/lib/pov/types'

const BUCKET = STORAGE_BUCKETS.EVENT_MEDIA

const FOLDER_BY_TYPE: Record<PovMediaType, string> = {
  photo: 'photos',
  video: 'videos',
  audio: 'audio',
}

export interface PovUploadResult {
  bucket:    string
  path:      string
  publicUrl: string
  sizeBytes: number
  mimeType:  string
}

/**
 * Uploads a guest media file to the event-media bucket using the service-role
 * client (bypasses RLS — caller MUST authorize the guest/event first).
 *
 * Path: tenants/{tenantId}/pov-events/{eventId}/{photos|videos|audio}/{guestId}/{ts}-{file}
 */
export async function uploadPovMedia(params: {
  tenantId:  string
  eventId:   string
  guestId:   string
  mediaType: PovMediaType
  fileName:  string
  buffer:    ArrayBuffer | Uint8Array
  mimeType:  string
}): Promise<PovUploadResult> {
  const { tenantId, eventId, guestId, mediaType, fileName, buffer, mimeType } = params

  assertSafeStoragePath(tenantId)
  assertSafeStoragePath(eventId)
  assertSafeStoragePath(guestId)

  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  const sizeBytes = data.byteLength

  // Server-side type + size validation (never trust the client).
  if (!POV_ALLOWED_MIME[mediaType].includes(mimeType)) {
    throw new Error(`Unsupported ${mediaType} type "${mimeType}".`)
  }
  if (sizeBytes > POV_MAX_BYTES[mediaType]) {
    throw new Error(
      `File is too large. Max ${(POV_MAX_BYTES[mediaType] / 1024 / 1024).toFixed(0)} MB for ${mediaType}.`,
    )
  }

  const safeName = sanitizeFileName(fileName) || `${mediaType}.bin`
  const path = [
    'tenants', tenantId, 'pov-events', eventId,
    FOLDER_BY_TYPE[mediaType], guestId, `${Date.now()}-${safeName}`,
  ].join('/')

  const supabase = getSupabaseServerClient()

  const doUpload = () =>
    supabase.storage.from(BUCKET).upload(path, data, { contentType: mimeType, upsert: false })

  let { error } = await doUpload()
  if (error && /bucket not found/i.test(error.message)) {
    await supabase.storage.createBucket(BUCKET, { public: true })
    ;({ error } = await doUpload())
  }
  if (error) throw new Error(`[pov:uploadMedia] ${error.message}`)

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)

  return {
    bucket:    BUCKET,
    path,
    publicUrl: urlData.publicUrl,
    sizeBytes,
    mimeType,
  }
}

/** Removes an object from the event-media bucket. Best-effort. */
export async function deletePovMediaObject(path: string): Promise<void> {
  if (!path) return
  try {
    await getSupabaseServerClient().storage.from(BUCKET).remove([path])
  } catch {
    // non-fatal
  }
}

/** Detects the media type from a mime string, or null if unsupported. */
export function detectMediaType(mime: string): PovMediaType | null {
  if (POV_ALLOWED_MIME.photo.includes(mime)) return 'photo'
  if (POV_ALLOWED_MIME.video.includes(mime)) return 'video'
  if (POV_ALLOWED_MIME.audio.includes(mime)) return 'audio'
  return null
}
