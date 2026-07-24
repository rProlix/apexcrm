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
  damage_case_id?: string | null
  observation_type?: string | null
  normalized_damage_type?: string | null
  canonical_region?: string | null
  first_attribution?: {
    reporter: Record<string, unknown>
    sourceTimestamp: string | null
    sourceTimestampKind: string | null
    inspectionId: string | null
    uploadSessionId: string | null
    evidenceImageId: string | null
    latestUploader: Record<string, unknown>
    lastObservedAt: string | null
    observationCount: number
    needsReview: boolean
    repairStatus: string | null
  } | null
  created_at: string
}

export type ResolvedDamageImage = DamageImage & { url: string | null }
