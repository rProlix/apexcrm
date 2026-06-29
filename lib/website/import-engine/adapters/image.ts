// lib/website/import-engine/adapters/image.ts
// Image adapter — uploads one or more images as import pages.

import 'server-only'
import { uploadFile } from '@/lib/storage/uploadFile'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'
import type { DesignImportExtraction } from '@/lib/website/import-engine/types'

export interface ImageAdapterParams {
  tenantId: string
  websiteId: string
  importId: string
  images: Array<{ buffer: Buffer; mimeType: string; fileName: string }>
}

export interface ImageAdapterResult {
  ok: boolean
  error?: string
  extraction?: DesignImportExtraction
  warnings: string[]
}

function extForMime(mime: string): string {
  if (mime.includes('png')) return 'png'
  if (mime.includes('webp')) return 'webp'
  if (mime.includes('gif')) return 'gif'
  return 'jpg'
}

export async function extractFromImages(params: ImageAdapterParams): Promise<ImageAdapterResult> {
  const warnings: string[] = []
  if (params.images.length === 0) {
    return { ok: false, error: 'No images provided.', warnings }
  }

  const renderedPages: DesignImportExtraction['renderedPages'] = []
  const assets: DesignImportExtraction['assets'] = []

  for (let i = 0; i < params.images.length; i++) {
    const img = params.images[i]
    const pageNumber = i + 1
    const ext = extForMime(img.mimeType)
    const safeName = img.fileName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80) || `image-${pageNumber}.${ext}`

    try {
      const uploaded = await uploadFile({
        bucket: STORAGE_BUCKETS.WEBSITE_ASSETS,
        tenantId: params.tenantId,
        pathParts: ['import-engine', params.websiteId, params.importId, 'images'],
        fileName: `${pageNumber}-${safeName}`,
        buffer: img.buffer,
        mimeType: img.mimeType || `image/${ext}`,
        upsert: true,
      })

      renderedPages.push({
        pageNumber,
        publicUrl: uploaded.publicUrl ?? uploaded.path,
        storagePath: uploaded.path,
        aspectRatio: 16 / 9,
        width: 1920,
        height: 1080,
      })

      assets.push({
        id: `img-${pageNumber}`,
        kind: 'image',
        publicUrl: uploaded.publicUrl ?? uploaded.path,
        storagePath: uploaded.path,
        pageNumber,
      })
    } catch (e) {
      warnings.push(`Failed to upload image ${pageNumber}: ${e instanceof Error ? e.message : 'error'}`)
    }
  }

  if (renderedPages.length === 0) {
    return { ok: false, error: 'Could not upload any images.', warnings }
  }

  const extraction: DesignImportExtraction = {
    sourceType: params.images.length > 1 ? 'images' : 'image',
    pageCount: renderedPages.length,
    renderedPages,
    text: '',
    links: [],
    assets,
    fonts: [],
    colors: [],
    warnings,
  }

  return { ok: true, extraction, warnings }
}
