// lib/website-ai/types.ts
// Shared types for the AI Website Autofill feature

// ── Enums / string unions ──────────────────────────────────────────────────────

export type AiJobStatus =
  | 'draft'
  | 'analyzing'
  | 'ready'
  | 'applied'
  | 'failed'
  | 'cancelled'

export type AiJobSourceType =
  | 'mixed'
  | 'pasted_text'
  | 'reviews'
  | 'services'
  | 'products'
  | 'menu'
  | 'business_profile'
  | 'contact_hours'
  | 'faq'
  | 'policies'

export type AiSuggestionType =
  | 'hero'
  | 'about'
  | 'services'
  | 'products'
  | 'menu'
  | 'reviews'
  | 'testimonials'
  | 'faq'
  | 'contact'
  | 'hours'
  | 'gallery'
  | 'policies'
  | 'social_links'
  | 'navigation'
  | 'page'
  | 'section'
  | 'seo'
  | 'promotion'
  | 'unknown'

export type AiSuggestionAction = 'create' | 'update' | 'append' | 'replace' | 'ignore'

export type AiSuggestionStatus = 'pending' | 'accepted' | 'rejected' | 'edited' | 'applied'

export type DetectedBusinessType =
  | 'car_rental'
  | 'salon'
  | 'plumber'
  | 'restaurant'
  | 'ecommerce'
  | 'contractor'
  | 'auto_shop'
  | 'medical'
  | 'fitness'
  | 'unknown'

// ── Database row types ─────────────────────────────────────────────────────────

export interface AiImportJob {
  id:                     string
  tenant_id:              string
  created_by:             string | null
  source_type:            AiJobSourceType
  raw_input:              string
  status:                 AiJobStatus
  model:                  string
  summary:                string | null
  detected_business_type: DetectedBusinessType | null
  detected_content_types: string[]
  confidence:             number | null
  error_message:          string | null
  token_usage:            Record<string, unknown>
  metadata:               Record<string, unknown>
  created_at:             string
  updated_at:             string
}

export interface AiSuggestion {
  id:               string
  tenant_id:        string
  job_id:           string
  suggestion_type:  AiSuggestionType
  action:           AiSuggestionAction
  target_page_id:   string | null
  target_section_id: string | null
  title:            string | null
  description:      string | null
  reason:           string | null
  extracted_data:   Record<string, unknown>
  proposed_section: Record<string, unknown>
  confidence:       number
  status:           AiSuggestionStatus
  admin_notes:      string | null
  applied_at:       string | null
  created_at:       string
  updated_at:       string
}

export interface AiAppliedChange {
  id:              string
  tenant_id:       string
  job_id:          string
  suggestion_id:   string | null
  applied_by:      string | null
  target_type:     string
  target_id:       string | null
  before_snapshot: Record<string, unknown> | null
  after_snapshot:  Record<string, unknown> | null
  created_at:      string
}

// ── Gemini output shape ────────────────────────────────────────────────────────

export interface GeminiReviewItem {
  name:   string
  rating: number
  quote:  string
  source: string
}

export interface GeminiServiceItem {
  name:        string
  price?:      string
  description?: string
}

export interface GeminiProductItem {
  name:        string
  price?:      string
  description?: string
  category?:   string
}

export interface GeminiFaqItem {
  question: string
  answer:   string
}

export interface GeminiHoursItem {
  day:    string
  open:   string | null
  close:  string | null
  closed: boolean
}

export interface GeminiProposedSection {
  type:        string
  heading?:    string
  subheading?: string
  items?:      unknown[]
  [key: string]: unknown
}

export interface GeminiSuggestion {
  type:            AiSuggestionType
  action:          AiSuggestionAction
  confidence:      number
  title:           string
  reason:          string
  target?: {
    pageSlug?:    string
    sectionType?: string
  }
  data:            Record<string, unknown>
  proposedSection: GeminiProposedSection
}

export interface GeminiResult {
  summary:               string
  detectedBusinessType:  DetectedBusinessType
  detectedContentTypes:  string[]
  overallConfidence:     number
  designSystem?:         Record<string, unknown>
  suggestions:           GeminiSuggestion[]
  warnings:              string[]
  missingInfoQuestions:  string[]
}

// ── Apply options ──────────────────────────────────────────────────────────────

export type PublishMode = 'draft_only' | 'publish_now'

export interface ApplyOptions {
  suggestionIds: string[]
  publishMode:   PublishMode
}

export interface ApplyResult {
  applied:  number
  skipped:  number
  errors:   string[]
  changes:  AiAppliedChange[]
}

// ── Tenant context for prompting ───────────────────────────────────────────────

export interface TenantContext {
  tenantId:     string
  tenantName:   string
  businessType: string | null
  hasStore:     boolean
  siteName:     string | null
  existingPages: Array<{ slug: string; title: string | null; page_type: string }>
  existingProductNames: string[]
}
