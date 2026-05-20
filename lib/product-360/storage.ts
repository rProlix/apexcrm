// lib/product-360/storage.ts
// Supabase Storage helpers for the product_360 module.
// Buckets:
//   product-360-frames     — generated 360 frames
//   product-360-references — uploaded visual anchors
// Path: {tenant_id}/{product_id}/{package_id}/frame-0000.png
//
// SERVER-ONLY. Never import from client components.

import { getSupabaseServerClient }  from '@/lib/supabase/server'
export const P360_BUCKET = process.env.P360_STORAGE_BUCKET ?? 'product-360-frames'
export const P360_REFERENCE_BUCKET = process.env.P360_REFERENCE_BUCKET ?? 'product-360-references'

// ─── Path helpers ─────────────────────────────────────────────────────────────

export function getFramePath(
  tenantId:   string,
  productId:  string,
  packageId:  string,
  frameIndex: number,
  ext = 'png',
): string {
  const padded = String(frameIndex).padStart(4, '0')
  return `${tenantId}/${productId}/${packageId}/frame-${padded}.${ext}`
}

export function getReferencePath(
  tenantId:  string,
  productId: string,
  packageId: string,
  ext = 'png',
): string {
  return `${tenantId}/${productId}/${packageId}/reference.${ext}`
}

export function getCoverPath(
  tenantId:  string,
  productId: string,
  packageId: string,
): string {
  return `tenants/${tenantId}/360/${productId}/packages/${packageId}/cover.webp`
}

export function getModelPath(
  tenantId:  string,
  productId: string,
  packageId: string,
  filename = 'model.glb',
): string {
  return `tenants/${tenantId}/360/${productId}/packages/${packageId}/models/${filename}`
}

// ─── Public URL ───────────────────────────────────────────────────────────────

export function getPublicUrl(storagePath: string): string {
  const supabase = getSupabaseServerClient()
  const { data } = supabase.storage.from(P360_BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// ─── Upload ───────────────────────────────────────────────────────────────────

export interface UploadFrameParams {
  tenantId:    string
  productId:   string
  packageId:   string
  frameIndex:  number
  buffer:      Uint8Array | ArrayBuffer
  contentType?: string
  ext?:        string
}

export interface UploadResult {
  imageUrl:    string
  storagePath: string
}

export async function uploadFrame(params: UploadFrameParams): Promise<UploadResult> {
  const {
    tenantId, productId, packageId, frameIndex,
    buffer, contentType = 'image/png', ext = 'png',
  } = params
  const supabase    = getSupabaseServerClient()
  const storagePath = getFramePath(tenantId, productId, packageId, frameIndex, ext)
  const data        = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)

  const { error } = await supabase.storage
    .from(P360_BUCKET)
    .upload(storagePath, data, { contentType, upsert: true })

  if (error) {
    const msg = error.message.toLowerCase()
    if (msg.includes('bucket') || msg.includes('not found')) {
      throw new Error(
        `Storage bucket "${P360_BUCKET}" is not configured. ` +
        `Run the product 360 Leonardo reference workflow migration to create all required buckets.`,
      )
    }
    throw new Error(`Storage upload failed: ${error.message}`)
  }

  return { imageUrl: getPublicUrl(storagePath), storagePath }
}

export async function fetchAndUploadFrame(params: {
  tenantId:   string
  productId:  string
  packageId:  string
  frameIndex: number
  sourceUrl:  string
  ext?:       string
}): Promise<UploadResult> {
  const { sourceUrl, ...rest } = params
  const res = await fetch(sourceUrl)
  if (!res.ok) {
    throw new Error(`Failed to fetch frame image (HTTP ${res.status}): ${sourceUrl}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('image/')) {
    throw new Error(`Remote frame URL did not return an image content-type. Got: ${contentType || 'unknown'}`)
  }
  const buffer = await res.arrayBuffer()
  return uploadFrame({
    ...rest,
    buffer,
    contentType,
  })
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deletePackageStorage(
  tenantId:  string,
  productId: string,
  packageId: string,
): Promise<boolean> {
  try {
    const supabase = getSupabaseServerClient()
    const prefix   = `tenants/${tenantId}/360/${productId}/packages/${packageId}/`

    const { data, error: listErr } = await supabase.storage.from(P360_BUCKET).list(prefix, { limit: 1000 })
    if (listErr) {
      console.warn(`[p360:deletePackageStorage] list error: ${listErr.message}`)
      return false
    }
    if (!data?.length) return true

    const paths = data.map((f: { name: string }) => `${prefix}${f.name}`)
    const { error: delErr } = await supabase.storage.from(P360_BUCKET).remove(paths)
    if (delErr) {
      console.warn(`[p360:deletePackageStorage] remove error: ${delErr.message}`)
      return false
    }
    return true
  } catch (err) {
    console.warn('[p360:deletePackageStorage] unexpected:', err)
    return false
  }
}
