// lib/product-360/types.ts
// Canonical TypeScript types for the product_360 module.

// ─── Enums ────────────────────────────────────────────────────────────────────

export type P360Status =
  | 'draft'
  | 'queued'
  | 'planning'
  | 'generating'
  | 'processing'
  | 'paused_quota'
  | 'ready'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'archived'

export type P360FrameStatus =
  | 'pending'
  | 'queued'
  | 'generating'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped'
  | 'archived'

export type P360PackageType =
  | 'ai_generated'
  | 'uploaded_frames'
  | 'hybrid'
  | 'model_3d'

export type P360JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type P360HotspotAction =
  | 'info'
  | 'link'
  | 'add_to_cart'
  | 'open_section'
  | 'promo'

// ─── Core domain models ───────────────────────────────────────────────────────

export interface P360Package {
  id:                   string
  tenant_id:            string
  product_id:           string | null
  created_by:           string | null
  name:                 string
  slug:                 string
  description:          string | null
  status:               P360Status
  is_enabled:           boolean
  /** Canonical "default/primary" flag. Use is_primary for new code. */
  is_default:           boolean
  /** Alias for is_default (added migration 034). Both are kept in sync. */
  is_primary:           boolean
  package_type:         P360PackageType
  /** Generic preset label (e.g. "standard", "premium"). See also specific preset columns. */
  preset:               string | null
  // ── Promo scheduling (canonical column names) ──────────────────────────────
  promo_starts_at:      string | null
  promo_ends_at:        string | null
  promo_tag:            string | null
  /** Alias for promo_starts_at (added migration 034). */
  starts_at:            string | null
  /** Alias for promo_ends_at (added migration 034). */
  ends_at:              string | null
  // ── Frame counts & progress ────────────────────────────────────────────────
  frame_count:          number
  target_frame_count:   number
  /** Actual frame rows in DB (updated during generation, ground truth). */
  frames_done:          number
  /** 0-100 progress, updated after each batch of frames during generation. */
  progress_percent:     number
  // ── Media ──────────────────────────────────────────────────────────────────
  /** Canonical preview thumbnail (middle frame). Prefer over cover_frame_url. */
  preview_image_url:    string | null
  cover_frame_url:      string | null
  model_url:            string | null
  ar_model_url:         string | null
  // ── Generation ─────────────────────────────────────────────────────────────
  generation_prompt:    string | null
  generation_notes:     string | null
  negative_prompt:      string | null
  generation_provider:  string
  /** Canonical AI model column (e.g. "gemini-2.5-flash-lite"). */
  ai_model:             string
  /** Alias for ai_model (added migration 034). */
  generation_model:     string | null
  generation_job_id:    string | null
  generation_error:     string | null
  /** Timestamp of the last successful generation completion. */
  last_generated_at:    string | null
  // ── Error tracking (added migration 038) ────────────────────────────────────
  /** Normalized error type from the last failed/paused generation attempt. */
  last_error_type:           string | null
  /** ISO timestamp of the last generation error. */
  last_error_at:             string | null
  /** Earliest time this package can be retried. */
  next_retry_at:             string | null
  /** Number of resume attempts. */
  retry_count:               number
  generation_started_at:     string | null
  generation_completed_at:   string | null
  // ── Cancel support (added migration 040) ────────────────────────────────────
  /** True when a cancel was requested — checked by the generation loop before each frame. */
  cancel_requested:          boolean
  /** ISO timestamp when the cancel was first requested. */
  cancel_requested_at:       string | null
  /** ISO timestamp when the package transitioned to 'cancelled' status. */
  cancelled_at:              string | null
  /** Human-readable error message from the last failure (stored for display after refresh). */
  last_error_message:        string | null
  /** Raw/technical error detail for collapsible "View details" UI. */
  last_error_details:        string | null
  // ── Archive support (added migration 041) ────────────────────────────────────
  /** ISO timestamp when the package was soft-archived. */
  archived_at:               string | null
  /** User ID who archived the package. */
  archived_by:               string | null
  /** Optional reason for archiving. */
  archive_reason:            string | null
  /** Queue ordering position within the tenant (populated by queue management). */
  queue_position:            number | null
  /** ISO timestamp when the package entered the 'queued' status. */
  queued_at:                 string | null
  // ── Locked scene spec (added migration 037) ────────────────────────────────
  /** URL of the canonical 0° master frame used as a visual anchor for all frames. */
  master_frame_url:          string | null
  /** True once the master frame has been successfully generated. */
  master_frame_generated:    boolean
  /** Frozen scene blueprint JSON (subject, camera, lighting, background, rules). */
  scene_blueprint:           Record<string, unknown> | null
  /** The full locked scene description template used for all non-master frames. */
  locked_generation_prompt:  string | null
  /** 'standard' or 'strict' (default). Controls how forceful the locking language is. */
  consistency_mode:          'standard' | 'strict'
  // ── Config blobs ───────────────────────────────────────────────────────────
  settings:             Record<string, unknown>
  hotspot_config:       P360HotspotConfig[]
  lighting_config:      P360LightingConfig
  camera_config:        P360CameraConfig
  // ── Presets (added in migration 033) ────────────────────────────────────────
  lighting_preset:      string | null
  background_preset:    string | null
  category_preset:      string | null
  camera_preset:        string | null
  camera_distance:      number | null
  camera_height:        number | null
  fov:                  number | null
  zoom:                 number | null
  shadow_strength:      number | null
  reflection_intensity: number | null
  turn_direction:       'clockwise' | 'counter_clockwise'
  output_width:         number | null
  output_height:        number | null
  // ── Timestamps ─────────────────────────────────────────────────────────────
  created_at:           string
  updated_at:           string
}

export interface P360Frame {
  id:                  string
  package_id:          string
  tenant_id:           string
  product_id:          string | null
  frame_index:         number
  angle_degrees:       number
  image_url:           string
  storage_path:        string | null
  width:               number | null
  height:              number | null
  file_size:           number | null
  alt_text:            string | null
  metadata:            Record<string, unknown>
  prompt_used:         string | null
  /** True for frame_index=0 — this is the canonical visual reference. */
  is_master_frame:     boolean
  /** How many times this frame has been generated (1 = first attempt). */
  generation_attempt:  number
  /** True if consistency checks flagged this frame as too different from the master. */
  needs_regeneration:  boolean
  /** Optional 0–1 score from post-processing consistency checks. */
  consistency_score:   number | null
  // ── Frame lifecycle (added migration 041) ────────────────────────────────────
  status:                  P360FrameStatus
  archived_at:             string | null
  queue_position:          number | null
  queued_at:               string | null
  generation_started_at:   string | null
  generation_finished_at:  string | null
  error_type:              string | null
  error_message:           string | null
  created_at:              string
  updated_at:              string
}

export interface P360Hotspot {
  id:           string
  tenant_id:    string
  package_id:   string
  product_id:   string
  frame_index:  number | null
  label:        string
  description:  string | null
  x:            number
  y:            number
  z:            number | null
  action_type:  P360HotspotAction
  action_value: string | null
  is_enabled:   boolean
  created_at:   string
  updated_at:   string
}

export interface P360GenerationJob {
  id:                 string
  tenant_id:          string
  package_id:         string
  product_id:         string
  requested_by:       string | null
  provider:           string
  provider_job_id:    string | null
  status:             P360JobStatus
  prompt:             string
  negative_prompt:    string | null
  target_frame_count: number
  frames_completed:   number
  error_message:      string | null
  raw_response:       Record<string, unknown>
  created_at:         string
  started_at:         string | null
  completed_at:       string | null
  updated_at:         string
}

export interface P360ModuleSettings {
  id:                      string
  tenant_id:               string
  default_frame_count:     number
  allow_ai_generation:     boolean
  allow_manual_upload:     boolean
  require_owner_approval:  boolean
  default_viewer_settings: P360ViewerSettings
  created_at:              string
  updated_at:              string
}

// ─── Config objects ───────────────────────────────────────────────────────────

export interface P360HotspotConfig {
  frame_index:  number | null
  label:        string
  x:            number
  y:            number
  action_type:  P360HotspotAction
  action_value: string | null
}

export interface P360LightingConfig {
  ambientIntensity?:     number
  directionalIntensity?: number
  environmentMap?:       string
  vignetteStrength?:     number
  rimLightColor?:        string
}

export interface P360CameraConfig {
  fov?:              number
  minZoom?:          number
  maxZoom?:          number
  initialZoom?:      number
  enablePan?:        boolean
  sensitivity?:      number
  autoRotateSpeed?:  number
}

export interface P360ViewerSettings {
  autoRotate?:      boolean
  autoRotateSpeed?: number
  showControls?:    boolean
  enableZoom?:      boolean
  enablePan?:       boolean
  enableHotspots?:  boolean
  showFullscreen?:  boolean
  dragSensitivity?: number
  bgColor?:         string
}

// ─── Composite / list types ───────────────────────────────────────────────────

export interface P360PackageWithFrames extends P360Package {
  frames:    P360Frame[]
  hotspots:  P360Hotspot[]
}

export interface P360PackageSummary extends P360Package {
  /** Overrides the DB column — always reflects count of actual frame rows. */
  frames_done:       number
  product_name:      string | null
  /** Populated when loading packages alongside products. */
  product_image_url?: string | null
}

/**
 * Store product as seen by the 360 module.
 * Only contains columns that actually exist in the products table (005_ecommerce.sql).
 * products table: id, tenant_id, name, description, price, currency, inventory_count, is_active, created_at
 * product_images table: id, tenant_id, product_id, image_url, created_at
 */
export interface P360StoreProduct {
  id:              string
  tenant_id:       string
  name:            string
  description:     string | null
  price:           number | null
  currency:        string | null
  is_active:       boolean
  /** First image URL from product_images, or null if no images */
  image_url:       string | null
  /** Whether this product has at least one ready+enabled 360 package */
  has_active_360:  boolean
  /** Count of non-archived 360 packages for this product */
  package_count:   number
  created_at:      string
}

/** Minimal public payload — no private fields. Only enabled/ready packages. */
export interface P360PublicPayload {
  packageId:    string
  packageName:  string
  slug:         string
  packageType:  P360PackageType
  coverUrl:     string | null
  viewerSettings: P360ViewerSettings
  lightingConfig: P360LightingConfig
  cameraConfig:   P360CameraConfig
  frames: Array<{
    frame_index:   number
    angle_degrees: number
    image_url:     string
    alt_text:      string | null
  }>
  hotspots: Array<{
    id:           string
    frame_index:  number | null
    label:        string
    description:  string | null
    x:            number
    y:            number
    action_type:  P360HotspotAction
    action_value: string | null
  }>
}

/** Multi-package list for a product (storefront) */
export interface P360ProductPackageList {
  productId:   string
  productName: string
  packages:    P360PublicPayload[]
}
