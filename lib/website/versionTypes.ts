// lib/website/versionTypes.ts — TypeScript types for website version history

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

/** Normalized section inside a snapshot */
export interface WebsiteSnapshotSection {
  id: string
  section_type: string
  section_key: string | null
  sort_order: number
  content: Record<string, unknown>
  style_config: Record<string, unknown> | null
  animation_config: Record<string, unknown> | null
  is_visible: boolean
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

/** Full website snapshot stored in site_versions.snapshot */
export interface WebsiteSnapshot {
  schemaVersion: number
  tenantId: string
  capturedAt: string
  settings: Record<string, unknown>
  navigation: Record<string, unknown>[]
  pages: WebsiteSnapshotPage[]
}

/** Summary row returned from version list queries */
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
  /** Populated when joining auth.users (optional) */
  created_by_email?: string | null
}

/** Full version including snapshot */
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
  snapshot?: WebsiteSnapshot
  restoredFromVersionId?: string
}

export interface VersionResult<T> {
  data: T | null
  error: string | null
}
