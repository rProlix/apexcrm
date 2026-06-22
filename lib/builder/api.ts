'use client'

// lib/builder/api.ts — Client-side API helpers for the visual editor
// All functions make authenticated fetch calls to the existing website API routes.

import type { BuilderSection } from './types'

// ── Section operations ────────────────────────────────────────────────────────

/** Save updated content to a single section */
export async function saveSection(
  sectionId: string,
  patch: { content?: Record<string, unknown>; sort_order?: number; is_visible?: boolean },
): Promise<BuilderSection | null> {
  const res = await fetch(`/api/website/sections/${sectionId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(patch),
  })
  if (!res.ok) {
    console.error('[builder] saveSection failed', await res.text())
    return null
  }
  const json = await res.json()
  return json.section as BuilderSection
}

/** Create a new section */
export async function createSection(params: {
  pageId:       string
  sectionType:  string
  content:      Record<string, unknown>
  sort_order?:  number
}): Promise<BuilderSection | null> {
  const res = await fetch('/api/website/sections', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      page_id:      params.pageId,
      section_type: params.sectionType,
      content:      params.content,
      sort_order:   params.sort_order ?? 999,
      is_visible:   true,
    }),
  })
  if (!res.ok) {
    console.error('[builder] createSection failed', await res.text())
    return null
  }
  const json = await res.json()
  return json.section as BuilderSection
}

/** Delete a section */
export async function deleteSection(sectionId: string): Promise<boolean> {
  const res = await fetch(`/api/website/sections/${sectionId}`, {
    method: 'DELETE',
  })
  return res.ok
}

/** Batch-update sort_order for all sections (called after DnD reorder) */
export async function reorderSections(
  sections: Pick<BuilderSection, 'id' | 'sort_order'>[],
): Promise<boolean> {
  const res = await fetch('/api/website/sections/reorder', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sections }),
  })
  return res.ok
}

// ── Publish ───────────────────────────────────────────────────────────────────

export interface PublishSiteResult {
  ok:          boolean
  published:   boolean
  versionId?:  string
  pageCount?:  number
  sectionCount?: number
  publishedAt?: string
  liveUrl?:    string
  warnings?:   string[]
  error?:      string
  details?:    string
  step?:       string
}

export async function publishSite(
  tenantId: string,
  publish:  boolean,
  opts?: {
    /** Current editor sections — sent to publish to ensure latest in-memory state is captured */
    clientPageSections?: import('@/lib/website/versionTypes').ClientPageSections
  },
): Promise<PublishSiteResult> {
  const body: Record<string, unknown> = { tenant_id: tenantId, publish }
  if (opts?.clientPageSections) {
    body.clientPageSections = opts.clientPageSections
  }
  const res = await fetch('/api/website/publish', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({ ok: false, error: 'Invalid response' }))
  return json as PublishSiteResult
}

// ── Image upload ──────────────────────────────────────────────────────────────

/** Upload a file to Supabase storage and return the public URL */
export async function uploadSectionImage(
  file: File,
  tenantId: string,
): Promise<string | null> {
  const form = new FormData()
  form.append('file', file)
  form.append('tenant_id', tenantId)

  const res = await fetch('/api/website/assets/upload', {
    method: 'POST',
    body:   form,
  })
  if (!res.ok) return null
  const json = await res.json()
  return (json.url as string) ?? null
}

// ── Premium 3D Scroll Hero assets ─────────────────────────────────────────────

export interface Website3DAsset {
  id:               string
  tenant_id:        string
  website_id?:      string | null
  business_id?:     string | null
  section_id?:      string | null
  sequence_id?:     string | null
  name:             string
  asset_type:       string
  render_mode?:     string | null
  public_url:       string | null
  storage_path:     string | null
  bucket?:          string | null
  mime_type:        string | null
  file_size_bytes:  number | null
  width?:           number | null
  height?:          number | null
  duration_seconds?: number | null
  frame_count?:     number | null
  frame_index?:     number | null
  fps?:             number | null
  sort_order?:      number | null
  is_active?:       boolean | null
  is_archived?:     boolean | null
  metadata:         Record<string, unknown>
  created_at:       string
  updated_at?:      string
}

export interface Website3DAssetGroups {
  videos:         Website3DAsset[]
  imageSequences: Website3DAsset[]
  posters:        Website3DAsset[]
  fallbacks:      Website3DAsset[]
  frames:         Website3DAsset[]
}

export interface Upload3DAssetOptions {
  assetType:   string
  websiteId?:  string | null
  businessId?: string | null
  sectionId?:  string | null
  sequenceId?: string | null
  frameIndex?: number | null
  renderMode?: 'three_model' | 'video_scrub' | null
  sortOrder?:  number
  name?:       string
  metadata?:   Record<string, unknown>
}

export interface Get3DAssetsFilters {
  assetType?:  string
  websiteId?:  string
  businessId?: string
  sectionId?:  string
  sequenceId?: string
  renderMode?: string
  includeArchived?: boolean
}

/**
 * Upload a 3D model / video / poster / fallback / environment / image-sequence
 * frame asset. Accepts either a plain asset-type string (legacy) or a full
 * options object (Media Manager). Returns the public URL + created asset row.
 *
 * Vercel-safe: large files (videos/models up to 100 MB) are uploaded DIRECTLY
 * to Supabase Storage via a one-time signed upload URL, so they never pass
 * through the serverless function (which caps request bodies at ~4.5 MB). If
 * signing/direct upload is unavailable, it falls back to the multipart route
 * (fine for small files / local dev).
 */
export async function uploadWebsite3DAsset(
  file:      File,
  tenantId:  string,
  options:   string | Upload3DAssetOptions,
): Promise<{ url: string; asset: Website3DAsset } | null> {
  const opts: Upload3DAssetOptions = typeof options === 'string' ? { assetType: options } : options

  // ── Preferred path: signed direct-to-storage upload ──
  try {
    const signRes = await fetch('/api/website/3d-assets/sign-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id:   tenantId,
        asset_type:  opts.assetType,
        render_mode: opts.renderMode ?? null,
        website_id:  opts.websiteId ?? null,
        section_id:  opts.sectionId ?? null,
        filename:    opts.name ?? file.name,
      }),
    })
    if (signRes.ok) {
      const { bucket, path, token, publicUrl } = await signRes.json()
      const { createClient } = await import('@/lib/supabase/browser')
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from(bucket)
        .uploadToSignedUrl(path, token, file, { contentType: file.type || undefined })
      if (!upErr) {
        const recRes = await fetch('/api/website/3d-assets/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id:       tenantId,
            asset_type:      opts.assetType,
            render_mode:     opts.renderMode ?? null,
            website_id:      opts.websiteId ?? null,
            business_id:     opts.businessId ?? null,
            section_id:      opts.sectionId ?? null,
            name:            opts.name ?? file.name,
            sequence_id:     opts.sequenceId ?? null,
            frame_index:     opts.frameIndex ?? null,
            bucket,
            storage_path:    path,
            public_url:      publicUrl,
            file_size_bytes: file.size,
            mime_type:       file.type || null,
            sort_order:      opts.sortOrder ?? 0,
            metadata:        opts.metadata ?? {},
          }),
        })
        if (recRes.ok) {
          const json = await recRes.json()
          return { url: (json.url ?? publicUrl) as string, asset: json.asset as Website3DAsset }
        }
        // Recorded file exists even if the DB row failed — return URL.
        return { url: publicUrl as string, asset: null as unknown as Website3DAsset }
      }
      console.warn('[builder] signed upload failed, falling back to multipart', upErr.message)
    }
  } catch (e) {
    console.warn('[builder] signed upload unavailable, falling back to multipart', e)
  }

  // ── Fallback: multipart route (small files / environments without signing) ──
  const form = new FormData()
  form.append('file', file)
  form.append('tenant_id', tenantId)
  form.append('asset_type', opts.assetType)
  form.append('name', opts.name ?? file.name)
  if (opts.websiteId)  form.append('website_id', opts.websiteId)
  if (opts.businessId) form.append('business_id', opts.businessId)
  if (opts.sectionId)  form.append('section_id', opts.sectionId)
  if (opts.sequenceId) form.append('sequence_id', opts.sequenceId)
  if (opts.frameIndex != null) form.append('frame_index', String(opts.frameIndex))
  if (opts.renderMode) form.append('render_mode', opts.renderMode)
  if (opts.sortOrder != null) form.append('sort_order', String(opts.sortOrder))
  if (opts.metadata)   form.append('metadata', JSON.stringify(opts.metadata))

  const res = await fetch('/api/website/3d-assets/upload', { method: 'POST', body: form })
  if (!res.ok) {
    console.error('[builder] uploadWebsite3DAsset failed', await res.text())
    return null
  }
  const json = await res.json()
  return { url: json.url as string, asset: json.asset as Website3DAsset }
}

/** List existing 3D assets for a tenant, optionally filtered. */
export async function getWebsite3DAssets(
  tenantId: string,
  filters?: string | Get3DAssetsFilters,
): Promise<Website3DAsset[]> {
  const f: Get3DAssetsFilters = typeof filters === 'string' ? { assetType: filters } : (filters ?? {})
  const url = build3DAssetsUrl(tenantId, f)
  const res = await fetch(url)
  if (!res.ok) return []
  const json = await res.json()
  return (json.assets as Website3DAsset[]) ?? []
}

function build3DAssetsUrl(tenantId: string, f: Get3DAssetsFilters): string {
  const url = new URL('/api/website/3d-assets', window.location.origin)
  url.searchParams.set('tenantId', tenantId)
  if (f.assetType)  url.searchParams.set('assetType', f.assetType)
  if (f.websiteId)  url.searchParams.set('websiteId', f.websiteId)
  if (f.businessId) url.searchParams.set('businessId', f.businessId)
  if (f.sectionId)  url.searchParams.set('sectionId', f.sectionId)
  if (f.sequenceId) url.searchParams.set('sequenceId', f.sequenceId)
  if (f.renderMode) url.searchParams.set('renderMode', f.renderMode)
  if (f.includeArchived) url.searchParams.set('includeArchived', 'true')
  return url.toString()
}

/** Fetch tenant 3D assets already grouped by asset_type. */
export async function getWebsite3DAssetGroups(
  tenantId: string,
  filters?: Get3DAssetsFilters,
): Promise<Website3DAssetGroups> {
  const empty: Website3DAssetGroups = { videos: [], imageSequences: [], posters: [], fallbacks: [], frames: [] }
  const res = await fetch(build3DAssetsUrl(tenantId, filters ?? {}))
  if (!res.ok) return empty
  const json = await res.json()
  return {
    videos:         (json.videos as Website3DAsset[]) ?? [],
    imageSequences: (json.imageSequences as Website3DAsset[]) ?? [],
    posters:        (json.posters as Website3DAsset[]) ?? [],
    fallbacks:      (json.fallbacks as Website3DAsset[]) ?? [],
    frames:         (json.frames as Website3DAsset[]) ?? [],
  }
}

/**
 * Record a website_3d_assets row WITHOUT uploading a new file (e.g. a parent
 * "image_sequence" group row that references already-uploaded frame URLs).
 */
export async function recordWebsite3DAsset(
  tenantId: string,
  body: {
    assetType:   string
    name:        string
    publicUrl:   string
    storagePath: string
    bucket?:     string | null
    sectionId?:  string | null
    websiteId?:  string | null
    sequenceId?: string | null
    renderMode?: string | null
    frameCount?: number | null
    fps?:        number | null
    metadata?:   Record<string, unknown>
  },
): Promise<Website3DAsset | null> {
  const res = await fetch('/api/website/3d-assets/record', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      tenant_id:    tenantId,
      asset_type:   body.assetType,
      name:         body.name,
      public_url:   body.publicUrl,
      storage_path: body.storagePath,
      bucket:       body.bucket ?? null,
      section_id:   body.sectionId ?? null,
      website_id:   body.websiteId ?? null,
      sequence_id:  body.sequenceId ?? null,
      render_mode:  body.renderMode ?? null,
      frame_count:  body.frameCount ?? null,
      fps:          body.fps ?? null,
      metadata:     body.metadata ?? {},
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  return (json.asset as Website3DAsset) ?? null
}

/** Rename / re-sort / update metadata / archive a 3D asset (PATCH). */
export async function updateWebsite3DAsset(
  assetId: string,
  patch: { name?: string; sort_order?: number; is_archived?: boolean; is_active?: boolean; metadata?: Record<string, unknown> },
): Promise<Website3DAsset | null> {
  const res = await fetch(`/api/website/3d-assets/${assetId}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(patch),
  })
  if (!res.ok) return null
  const json = await res.json()
  return (json.asset as Website3DAsset) ?? null
}

/** Archive (soft-delete) a 3D asset. */
export async function archiveWebsite3DAsset(assetId: string): Promise<boolean> {
  const res = await fetch(`/api/website/3d-assets/${assetId}`, { method: 'DELETE' })
  return res.ok
}

/**
 * Activate an uploaded asset as the active hero media for a section. Flips the
 * is_active flag server-side and returns the content patch the caller should
 * merge into the draft section content (autosaved through the builder store).
 */
export async function activateWebsite3DAsset(
  assetId:   string,
  mode:      'video' | 'image_sequence' | 'poster' | 'fallback',
  sectionId?: string,
  opts?: { sequenceId?: string | null },
): Promise<{ contentPatch: Record<string, unknown>; asset: Website3DAsset } | null> {
  const res = await fetch(`/api/website/3d-assets/${assetId}/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, section_id: sectionId ?? null, sequence_id: opts?.sequenceId ?? null }),
  })
  if (!res.ok) {
    console.error('[builder] activateWebsite3DAsset failed', await res.text())
    return null
  }
  const json = await res.json()
  return { contentPatch: json.contentPatch ?? {}, asset: json.asset as Website3DAsset }
}

/** Delete a 3D asset by id. */
export async function deleteWebsite3DAsset(id: string): Promise<boolean> {
  const url = new URL('/api/website/3d-assets', window.location.origin)
  url.searchParams.set('id', id)
  const res = await fetch(url.toString(), { method: 'DELETE' })
  return res.ok
}

// ── AI Image generation ───────────────────────────────────────────────────────

export interface SectionAiImageResult {
  publicUrl:           string
  altText:             string
  sectionId:           string
  sectionType:         string
  placementDescription: string
  updatedSection?:     BuilderSection | null
  error?:              string
  code?:               string
  applied:             boolean
}

/**
 * Calls the section-generate endpoint which:
 * 1. Builds rich business + section context
 * 2. Creates a section-aware image brief (grounded in this specific business)
 * 3. Generates an Imagen 4 Ultra image
 * 4. Uploads to Supabase Storage
 * 5. Applies the image URL to the section content
 * 6. Returns the updated section
 */
// ── Section image gallery helpers ─────────────────────────────────────────────

/**
 * Row shape for public.website_section_images.
 * public_url is nullable (image_url is the primary URL column).
 */
export interface WebsiteGeneratedImage {
  id:             string
  tenant_id:      string
  section_id:     string
  page_id:        string | null
  /** FK to website_image_plans */
  plan_id:        string | null
  created_by:     string | null
  status:         string
  provider:       string
  image_model:    string
  storage_bucket: string
  storage_path:   string | null
  /** Primary URL — use this for display */
  image_url:      string
  /** Nullable alias kept for backward compat */
  public_url:     string | null
  prompt:         string | null
  revised_prompt: string | null
  alt_text:       string | null
  caption:        string | null
  section_type:   string | null
  /** Image slot identifier (was image_slot) */
  slot_key:       string
  image_role:     string | null
  aspect_ratio:   string
  width:          number | null
  height:         number | null
  is_active:      boolean
  is_archived:    boolean
  metadata:       Record<string, unknown>
  error_message:  string | null
  created_at:     string
  updated_at:     string
}

/** Backward-compat alias — prefer WebsiteGeneratedImage */
export type WebsiteSectionImage = WebsiteGeneratedImage

export interface SectionImagesResult {
  images:       WebsiteGeneratedImage[]
  activeBySlot: Record<string, WebsiteGeneratedImage | null>
  sectionId:    string
  tenantId:     string
}

export async function getSectionImages(
  sectionId:       string,
  opts?: {
    imageSlot?:       string
    includeArchived?: boolean
  },
): Promise<SectionImagesResult> {
  const url = new URL(`/api/website/sections/${sectionId}/images`, window.location.origin)
  if (opts?.imageSlot)       url.searchParams.set('imageSlot', opts.imageSlot)
  if (opts?.includeArchived) url.searchParams.set('includeArchived', 'true')

  const res = await fetch(url.toString())
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as Record<string, string>).error ?? `Failed to load images (${res.status})`)
  }
  return res.json()
}

export async function activateSectionImage(
  sectionId: string,
  imageId:   string,
): Promise<{ success: boolean; publicUrl: string; updatedSection: BuilderSection | null }> {
  const res = await fetch(
    `/api/website/sections/${sectionId}/images/${imageId}/activate`,
    { method: 'POST' },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as Record<string, string>).error ?? `Failed to activate image (${res.status})`)
  }
  return res.json()
}

export async function archiveSectionImage(
  sectionId: string,
  imageId:   string,
  force = false,
): Promise<{ success: boolean; newActive: WebsiteGeneratedImage | null }> {
  const url = `/api/website/sections/${sectionId}/images/${imageId}/archive${force ? '?force=true' : ''}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as Record<string, string>).error ?? `Failed to archive image (${res.status})`)
  }
  return res.json()
}

export async function restoreSectionImage(
  sectionId: string,
  imageId:   string,
  activate  = false,
): Promise<{ success: boolean; restored: WebsiteGeneratedImage | null }> {
  const url = `/api/website/sections/${sectionId}/images/${imageId}/restore${activate ? '?activate=true' : ''}`
  const res = await fetch(url, { method: 'POST' })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as Record<string, string>).error ?? `Failed to restore image (${res.status})`)
  }
  return res.json()
}

export async function generateSectionAiImage(
  sectionId: string,
  tenantId:  string,
  opts?: {
    imageCount?:             number
    overwriteExistingImages?: boolean
  },
): Promise<SectionAiImageResult> {
  const res = await fetch('/api/website/ai-images/section-generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      sectionId,
      tenantId,
      imageCount:              opts?.imageCount              ?? 1,
      overwriteExistingImages: opts?.overwriteExistingImages ?? false,
    }),
  })

  const json = await res.json() as Record<string, unknown>

  if (!res.ok || json.error) {
    return {
      publicUrl:           '',
      altText:             '',
      sectionId,
      sectionType:         '',
      placementDescription: '',
      applied:             false,
      error:               (json.error as string) ?? 'Image generation failed',
      code:                (json.code as string) ?? undefined,
    }
  }

  return {
    publicUrl:            (json.publicUrl as string) ?? '',
    altText:              (json.altText as string) ?? '',
    sectionId:            (json.sectionId as string) ?? sectionId,
    sectionType:          (json.sectionType as string) ?? '',
    placementDescription: (json.placementDescription as string) ?? '',
    updatedSection:       (json.updatedSection as BuilderSection | null) ?? null,
    applied:              (json.applied as boolean) ?? false,
  }
}
