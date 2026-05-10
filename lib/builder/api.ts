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
export async function generateSectionAiImage(
  sectionId: string,
  tenantId:  string,
): Promise<SectionAiImageResult> {
  const res = await fetch('/api/website/ai-images/section-generate', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ sectionId, tenantId }),
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
