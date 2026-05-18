// lib/website/versionTypes.ts — Canonical types for website version history
// Every part of the versioning system uses these types.

export type WebsiteVersionStatus = 'draft' | 'published' | 'archived' | 'restored' | 'autosave'

export type WebsiteVersionSource =
  | 'manual'
  | 'autosave'
  | 'ai_autofill'
  | 'ai_images'
  | 'restore'
  | 'publish'
  | 'drag_drop'
  | 'section_edit'

export type WebsiteVersionEventType =
  | 'created'
  | 'updated'
  | 'published'
  | 'restored'
  | 'archived'
  | 'autosaved'
  | 'ai_applied'
  | 'sections_reordered'
  | 'section_created'
  | 'section_updated'
  | 'section_deleted'

/** A generated image attached to a section, captured inside a snapshot */
export interface WebsiteSnapshotImage {
  id: string
  sectionId: string
  url: string
  storagePath?: string | null
  alt?: string | null
  prompt?: string | null
  aspectRatio?: string | null
  slotKey?: string
  isActive: boolean
  metadata?: Record<string, unknown>
  createdAt?: string
}

/** Normalized section inside a snapshot — canonical shape used everywhere */
export interface WebsiteSnapshotSection {
  id: string
  section_type: string
  section_key: string | null
  sort_order: number
  content: Record<string, unknown>
  style_config: Record<string, unknown> | null
  animation_config: Record<string, unknown> | null
  is_visible: boolean
  /** Generated images attached to this section */
  images?: WebsiteSnapshotImage[]
  /** The currently active image id (if any) */
  activeImageId?: string | null
  created_at: string
  updated_at: string
}

/** Normalized page inside a snapshot */
export interface WebsiteSnapshotPage {
  id: string
  slug: string
  title: string | null
  meta_description: string | null
  page_type: string
  status: string
  sort_order: number
  seo: Record<string, unknown>
  sections: WebsiteSnapshotSection[]
}

/** Navigation item captured in a snapshot */
export interface WebsiteSnapshotNavItem {
  id: string
  label: string
  url?: string | null
  sort_order?: number
  is_visible?: boolean
  location?: string
  [key: string]: unknown
}

/**
 * Full website snapshot stored in site_versions.snapshot.
 * This is the canonical shape that all version operations use.
 */
export interface WebsiteSnapshot {
  /** Always 1 for this version of the schema */
  schemaVersion: 1
  tenantId: string
  capturedAt: string
  /** How this snapshot was created */
  source?: WebsiteVersionSource
  settings: Record<string, unknown>
  navigation: WebsiteSnapshotNavItem[]
  pages: WebsiteSnapshotPage[]
}

/** Summary row returned from version list queries (no snapshot) */
export interface WebsiteVersionSummary {
  id: string
  tenant_id: string
  version_number: number
  label: string | null
  description: string | null
  status: WebsiteVersionStatus
  source: WebsiteVersionSource
  page_count: number
  section_count: number
  created_by: string | null
  restored_from_version_id: string | null
  published_at: string | null
  created_at: string
  updated_at: string
  /** Optionally populated when joining auth.users */
  created_by_email?: string | null
}

/** Full version row including the snapshot JSON */
export interface WebsiteVersionFull extends WebsiteVersionSummary {
  snapshot: WebsiteSnapshot
}

/** Individual version event record */
export interface WebsiteVersionEvent {
  id: string
  tenant_id: string
  version_id: string | null
  event_type: WebsiteVersionEventType
  metadata: Record<string, unknown>
  created_by: string | null
  created_at: string
}

export interface CreateVersionInput {
  tenantId: string
  label?: string
  description?: string
  source?: WebsiteVersionSource
  status?: WebsiteVersionStatus
  createdBy?: string
  /** If provided, used directly. If missing, getCurrentWebsiteSnapshot is called. */
  snapshot?: WebsiteSnapshot
  restoredFromVersionId?: string
}

export interface VersionResult<T> {
  data: T | null
  error: string | null
}

/**
 * Client-side section data sent from the Zustand store when creating a checkpoint.
 * Used to override the current page's sections in the snapshot so unsaved
 * content edits (still in the 1.5s debounce window) are captured correctly.
 */
export interface ClientPageSections {
  pageId: string
  pageSlug: string
  pageTitle: string
  pageType: string
  sections: {
    id: string
    section_type: string
    section_key?: string | null
    sort_order: number
    content: Record<string, unknown>
    style_config?: Record<string, unknown> | null
    animation_config?: Record<string, unknown> | null
    is_visible: boolean
    created_at?: string
    updated_at?: string
  }[]
}
