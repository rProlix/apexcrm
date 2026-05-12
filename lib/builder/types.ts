// lib/builder/types.ts — Builder-specific types for the in-site visual editor

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** A section row from site_sections, enriched with client-side tracking */
export interface BuilderSection {
  id:               string
  page_id:          string
  tenant_id:        string
  section_type:     string
  section_key:      string | null
  content:          Record<string, unknown>
  sort_order:       number
  is_visible:       boolean
  animation_config?: Record<string, unknown> | null
  style_config?:     Record<string, unknown> | null
  created_at:       string
  updated_at:       string
}

/** Metadata about available section types for the section picker */
export interface SectionTypeDef {
  type:        string
  label:       string
  description: string
  icon:        string
  defaultContent: Record<string, unknown>
}

/** Context passed from the server page to the EditorShell */
export interface EditorContext {
  tenantId:  string
  pageId:    string
  pageName:  string
  pageSlug:  string
  isPublished: boolean
  sections:  BuilderSection[]
}
