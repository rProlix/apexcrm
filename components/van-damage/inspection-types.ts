export type DamageImage = {
  id: string
  slack_file_id: string | null
  content_type: string | null
  file_size_bytes: number | null
  width: number | null
  height: number | null
  image_role: string | null
  status: string
  created_at: string
  updated_at: string
}

export type BoundingBox = { x: number; y: number; width: number; height: number }

export type DamageItem = {
  id: string
  image_id: string | null
  damage_type: string | null
  vehicle_area: string | null
  severity: string | null
  confidence: number | null
  description: string | null
  repair_recommendation: string | null
  bounding_box: BoundingBox | null
  created_at: string
}

export type ResolvedDamageImage = DamageImage & { url: string | null }
