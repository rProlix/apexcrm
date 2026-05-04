// lib/ai/websiteImageTypes.ts
// TypeScript types for the AI Website Image Builder.
// Safe to import from both server and client (no secrets, no server-only APIs).

// ── Enums ────────────────────────────────────────────────────────────────────

export type ImagePlanStatus =
  | 'planned'
  | 'approved'
  | 'generating'
  | 'generated'
  | 'rejected'
  | 'disabled'
  | 'applied'

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
  page_id:                string | null
  section_id:             string | null
  plan_group_id:          string | null
  placement_key:          string
  section_type:           string | null
  image_role:             string
  title:                  string | null
  reason:                 string | null
  business_goal:          string | null
  image_description:      string | null
  visual_style:           string | null
  prompt:                 string
  negative_prompt:        string | null
  aspect_ratio:           string | null
  width:                  number | null
  height:                 number | null
  priority:               number
  use_existing_if_avail:  boolean
  selected_source:        ImageSource
  existing_asset_url:     string | null
  generated_asset_url:    string | null
  generated_storage_path: string | null
  generated_alt_text:     string | null
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

export interface ImagePlannerContext {
  tenantId:          string
  tenantName:        string
  businessType:      string | null
  hasStore:          boolean
  pages:             Array<{ id: string; slug: string; title: string | null; page_type: string }>
  sections:          Array<{ id: string; page_id: string; section_type: string; content: Record<string, unknown> }>
  existingImageUrls: string[]
  productCount:      number
  colorPalette?:     string | null
  siteTagline?:      string | null
}
