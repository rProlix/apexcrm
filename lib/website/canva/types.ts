// lib/website/canva/types.ts
// Shared Canva-import types + constants. No secrets; safe on client + server.

export const CANVA_SOURCE_TYPES = [
  'canva_url', 'embed_code', 'html_upload', 'zip_upload', 'asset_upload', 'manual',
] as const
export type CanvaSourceType = (typeof CANVA_SOURCE_TYPES)[number]

export const CANVA_IMPORT_MODES = ['preserve', 'converted'] as const
export type CanvaImportMode = (typeof CANVA_IMPORT_MODES)[number]

export const CANVA_IMPORT_STATUSES = [
  'draft', 'importing', 'converted', 'embedded', 'failed', 'archived',
] as const
export type CanvaImportStatus = (typeof CANVA_IMPORT_STATUSES)[number]

export const CANVA_ANIMATION_PRESERVATION = ['exact', 'approximate', 'partial', 'unknown'] as const
export type CanvaAnimationPreservation = (typeof CANVA_ANIMATION_PRESERVATION)[number]

export interface CanvaImportSettings {
  useAsHomepage:        boolean
  addEventCameraButton: boolean
  addGalleryButton:     boolean
  addRsvpButton:        boolean
  keepNativePovPages:   boolean
}

export const DEFAULT_CANVA_IMPORT_SETTINGS: CanvaImportSettings = {
  useAsHomepage:        true,
  addEventCameraButton: true,
  addGalleryButton:     true,
  addRsvpButton:        false,
  keepNativePovPages:   true,
}

export interface CanvaImportRow {
  id:                     string
  tenant_id:              string
  business_id:            string | null
  website_id:             string
  pov_event_id:           string | null
  source_type:            CanvaSourceType
  import_mode:            CanvaImportMode
  source_url:             string | null
  embed_code:             string | null
  storage_provider:       string | null
  bucket:                 string | null
  storage_path:           string | null
  status:                 CanvaImportStatus
  animation_preservation: CanvaAnimationPreservation
  import_summary:         Record<string, unknown>
  converted_pages:        unknown[]
  converted_assets:       unknown[]
  warnings:               string[]
  created_by:             string | null
  created_at:             string
  updated_at:             string
}

export const CANVA_APPROXIMATION_NOTICE =
  'Some Canva animations may be approximated when converted into editable sections. Use Preserve Canva Mode for highest animation fidelity.'
