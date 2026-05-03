// lib/360/types.ts
// Canonical type definitions for the product_360_spin module.

export type Product360Status =
  | 'draft'
  | 'queued'
  | 'generating'
  | 'ready'
  | 'failed'

export type Product360SourceType =
  | 'manual'
  | 'ai'

export interface Product360Package {
  id:              string
  tenant_id:       string
  product_id:      string | null
  created_by:      string | null
  name:            string
  description:     string | null
  source_type:     Product360SourceType
  prompt:          string | null
  frame_count:     number
  status:          Product360Status
  error_message:   string | null
  cover_image_url: string | null
  settings:        Record<string, unknown>
  created_at:      string
  updated_at:      string
}

export interface Product360Frame {
  id:            string
  package_id:    string
  tenant_id:     string
  frame_index:   number
  angle_degrees: number
  image_url:     string
  storage_path:  string | null
  width:         number | null
  height:        number | null
  created_at:    string
}

export interface Product360PackageWithFrames extends Product360Package {
  frames: Product360Frame[]
}

// Lightweight row for list views (no frames loaded)
export interface Product360PackageSummary extends Product360Package {
  frames_done:  number
  product_name: string | null
}

// Public storefront payload — omits private/internal fields
export interface Product360PublicPayload {
  packageId:   string
  packageName: string
  frames:      Array<{
    frame_index:   number
    angle_degrees: number
    image_url:     string
  }>
}
