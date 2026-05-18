'use client'

// lib/builder/createSnapshotFromBuilderState.ts
//
// Converts the current Zustand builder state into a ClientPageSections object
// that can be sent to POST /api/website/versions to ensure the checkpoint
// captures the actual visible editor state — including any content edits
// that are still within the 1.5s auto-save debounce window.

import type { ClientPageSections } from '@/lib/website/versionTypes'
import type { BuilderSection } from './types'

/**
 * Build the ClientPageSections payload from the current store sections.
 * This is sent alongside the checkpoint API call so the server uses these
 * sections for the current page instead of reading potentially stale DB data.
 */
export function buildClientPageSections(params: {
  pageId:    string
  pageSlug:  string
  pageTitle: string
  pageType:  string
  sections:  BuilderSection[]
}): ClientPageSections {
  return {
    pageId:    params.pageId,
    pageSlug:  params.pageSlug,
    pageTitle: params.pageTitle,
    pageType:  params.pageType,
    sections:  params.sections
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => ({
        id:               s.id,
        section_type:     s.section_type,
        section_key:      s.section_key ?? null,
        sort_order:       s.sort_order,
        content:          s.content ?? {},
        style_config:     s.style_config ?? null,
        animation_config: s.animation_config ?? null,
        is_visible:       s.is_visible,
        created_at:       s.created_at,
        updated_at:       s.updated_at,
      })),
  }
}
