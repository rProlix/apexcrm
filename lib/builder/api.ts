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

export async function publishSite(
  tenantId: string,
  publish: boolean,
): Promise<boolean> {
  const res = await fetch('/api/website/publish', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ tenant_id: tenantId, publish }),
  })
  return res.ok
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
