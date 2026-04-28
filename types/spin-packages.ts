// types/spin-packages.ts
// Domain types for the 360 Spin Package Module.

export type SpinPackageStatus = 'draft' | 'generating' | 'ready' | 'failed'

export interface SpinPackage {
  id:                string
  tenant_id:         string
  product_id:        string
  status:            SpinPackageStatus
  prompt_text:       string
  image_count:       number
  midjourney_job_id: string | null
  error_message:     string | null
  created_at:        string
  updated_at:        string
}

export interface SpinImage {
  id:              string
  spin_package_id: string
  tenant_id:       string
  image_url:       string
  storage_path:    string | null
  frame_index:     number
  created_at:      string
}

export interface SpinPackageWithImages extends SpinPackage {
  images: SpinImage[]
}

export interface SpinPackageWithProduct extends SpinPackage {
  product: {
    id:   string
    name: string
  }
}

// Request / response shapes used by the API layer
export interface CreateSpinPackageInput {
  tenant_id:   string
  product_id:  string
  prompt_text: string
  image_count?: number
}

export interface GenerateSpinPackageResult {
  success:     boolean
  package_id:  string
  frame_count: number
  error?:      string
}

// Progress event shape for polling
export interface SpinPackageProgress {
  package_id:       string
  status:           SpinPackageStatus
  frames_completed: number
  frames_total:     number
  error_message:    string | null
}

// Midjourney abstraction types
export interface MidjourneyJobResult {
  job_id:    string
  image_url: string
  status:    'pending' | 'processing' | 'completed' | 'failed'
}

export interface AnglePrompt {
  frame_index: number
  angle_deg:   number
  prompt:      string
}
