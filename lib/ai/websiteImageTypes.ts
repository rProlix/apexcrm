// lib/ai/websiteImageTypes.ts
// TypeScript types for the AI Website Image Builder.
// Safe to import from both server and client (no secrets, no server-only APIs).

// ── Enums ────────────────────────────────────────────────────────────────────

export type ImagePlanStatus =
  | 'planned'
  | 'queued'
  | 'approved'
  | 'generating'
  | 'generated'
  | 'uploaded'
  | 'applied'
  | 'rejected'
  | 'failed'
  | 'disabled'
  | 'skipped'
  | 'archived'

export type ImageJobStatus =
  | 'pending'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type ImageSource = 'generate' | 'existing' | 'uploaded' | 'manual' | 'none'

export type ImageAspectRatio =
  | '1:1'
  | '4:3'
  | '3:2'
  | '16:9'
  | '21:9'
  | '4:5'
  | '3:4'
  | '9:16'

/** What visual role the image serves in the website section. */
export type ImageRole =
  | 'hero_main'
  | 'hero_background'
  | 'about_feature'
  | 'service_card'
  | 'gallery_cover'
  | 'gallery_item'
  | 'product_banner'
  | 'category_banner'
  | 'contact_banner'
  | 'testimonial_background'
  | 'rewards_promo_banner'
  | 'cta_banner'
  | 'team_banner'
  | 'before_after'
  | 'section_background'
  | 'promo_banner'
  | 'feature_image'
  | 'other'

// ── DB Row types ──────────────────────────────────────────────────────────────

export interface WebsiteImagePlan {
  id:                     string
  tenant_id:              string
  // Targeting
  website_id:             string | null
  page_id:                string | null
  section_id:             string | null
  plan_group_id:          string | null
  job_id:                 string | null
  // Placement
  placement_key:          string
  section_type:           string | null
  image_role:             string
  // Descriptive metadata
  title:                  string | null
  reason:                 string | null
  business_goal:          string | null
  image_description:      string | null
  visual_style:           string | null
  // Generation inputs
  prompt:                 string
  negative_prompt:        string | null
  aspect_ratio:           string | null
  width:                  number | null
  height:                 number | null
  // Config
  priority:               number
  use_existing_if_avail:  boolean
  selected_source:        ImageSource
  existing_asset_url:     string | null
  // Generation output — original column names (kept for backward compat)
  generated_asset_url:    string | null
  generated_storage_path: string | null
  generated_alt_text:     string | null
  // Generation output — alias column names added in migration 054
  public_url:             string | null
  storage_path:           string | null
  alt_text:               string | null
  // Provider / source tracking (migration 054)
  source_type:            'ai_builder' | 'manual' | 'import' | 'regeneration' | null
  provider:               'google-imagen' | 'gemini' | 'manual' | null
  provider_request:       Record<string, unknown> | null
  provider_response:      Record<string, unknown> | null
  storage_bucket:         string | null
  // Error tracking on the plan itself (migration 054)
  error_message:          string | null
  error_details:          string | null
  // Lifecycle timestamps (migration 054)
  generated_at:           string | null
  applied_at:             string | null
  // Misc (migration 054)
  caption:                string | null
  sort_order:             number | null
  // Status / audit
  status:                 ImagePlanStatus
  created_by:             string | null
  created_at:             string
  updated_at:             string
}

export interface WebsiteImageJob {
  id:                  string
  tenant_id:           string
  plan_id:             string | null
  status:              ImageJobStatus
  model:               string
  prompt:              string | null
  negative_prompt:     string | null
  aspect_ratio:        string | null
  image_role:          string | null
  placement_key:       string | null
  storage_path:        string | null
  public_url:          string | null
  alt_text:            string | null
  generation_metadata: Record<string, unknown>
  error_message:       string | null
  created_by:          string | null
  created_at:          string
  updated_at:          string
}

// ── Planner output shape (returned by Gemini image planning step) ──────────

export interface ImagePlanItem {
  placement_key:     string
  section_type:      string
  image_role:        string
  title:             string
  reason:            string
  business_goal:     string
  image_description: string
  visual_style:      string
  prompt:            string
  negative_prompt:   string
  aspect_ratio:      string
  width?:            number
  height?:           number
  priority:          number
  use_existing_if_avail: boolean
}

export interface ImagePlannerResult {
  plan_group_id: string
  plans:         ImagePlanItem[]
  warnings:      string[]
}

// ── Generation result ─────────────────────────────────────────────────────────

export interface ImageGenerationResult {
  planId:      string
  jobId:       string
  publicUrl:   string
  storagePath: string
  altText:     string
  model:       string
}

// ── Context passed to planner ────────────────────────────────────────────────

export interface ImageContextServiceItem {
  name:        string
  price?:      string
  description: string
}

export interface ImageContextProductItem {
  name:        string
  price?:      number
  description: string
}

export interface ImageContextReviewItem {
  author:  string
  text:    string
  rating?: number
}

export interface ImageContextSectionDetail {
  id:           string
  page_id:      string
  section_type: string
  headline:     string
  body:         string
  items:        string[]
  ctaText:      string
  imageUrl:     string | null
  content:      Record<string, unknown>
}

export interface ImagePlannerContext {
  tenantId:          string
  tenantName:        string
  /** Legacy: prefer businessCategory */
  businessType:      string | null
  hasStore:          boolean
  pages:             Array<{ id: string; slug: string; title: string | null; page_type: string }>
  sections:          Array<{ id: string; page_id: string; section_type: string; content: Record<string, unknown> }>
  existingImageUrls: string[]
  productCount:      number
  colorPalette?:     string | null
  siteTagline?:      string | null

  // ── Enriched context (set by plan/route.ts via buildWebsiteImageContext) ──

  /** Free-text description of the business from tenant profile */
  businessDescription?:  string | null
  /** Structured category: restaurant, salon, contractor, auto_shop, etc. */
  businessCategory?:     string | null
  /** Detected by AI autofill (gemini-3-flash-preview analysis) */
  autofillBusinessType?: string | null
  /** Summary sentence from the most recent AI autofill job */
  autofillSummary?:      string | null
  /** Rich section content details for context-aware prompts */
  sectionDetails?:       ImageContextSectionDetail[]
  /** Services extracted from feature_grid sections + autofill results */
  services?:             ImageContextServiceItem[]
  /** Top products (if store enabled) */
  topProducts?:          ImageContextProductItem[]
  /** Customer reviews / testimonials */
  reviews?:              ImageContextReviewItem[]
}
