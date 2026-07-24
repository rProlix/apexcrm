export type InspectionVehicle = {
  id: string
  tenant_id: string
  name: string
  van_number: string | null
  make: string | null
  model: string | null
  year: number | null
  color: string | null
  plate_number: string | null
  vin: string | null
  status: string
  metadata: Record<string, unknown>
}

export type VehicleResolution =
  | {
      state: 'resolved'
      source: 'inspection_van_id' | 'upload_session_van_id' | 'legacy_van_number'
      vehicle: InspectionVehicle
      legacyVanNumber: string | null
      uploadSessionId: string | null
    }
  | {
      state: 'ambiguous'
      source: 'legacy_van_number'
      vehicle: null
      legacyVanNumber: string
      uploadSessionId: string | null
    }
  | {
      state: 'missing'
      source: 'none'
      vehicle: null
      legacyVanNumber: string | null
      uploadSessionId: string | null
    }

export type VehicleResolutionLoaders = {
  loadVehicleById: (tenantId: string, vehicleId: string) => Promise<InspectionVehicle | null>
  loadUploadSession: (
    tenantId: string,
    businessId: string,
    uploadSessionId: string | null,
    inspectionId: string
  ) => Promise<{ id: string; vanId: string | null } | null>
  loadVehiclesByNumber: (
    tenantId: string,
    vanNumber: string,
    limit: 2
  ) => Promise<InspectionVehicle[]>
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function extractLegacyVanNumber(metadata: Record<string, unknown>) {
  return (
    stringValue(metadata.vanNumber) ??
    stringValue(metadata.van_number) ??
    stringValue(metadata.vehicleNumber) ??
    stringValue(metadata.vehicle_number)
  )
}

export async function resolveInspectionVehicle(
  input: {
    tenantId: string
    businessId: string
    inspectionId: string
    inspectionVanId: string | null
    uploadSessionId: string | null
    metadata: Record<string, unknown>
  },
  loaders: VehicleResolutionLoaders
): Promise<VehicleResolution> {
  if (input.inspectionVanId) {
    const vehicle = await loaders.loadVehicleById(input.tenantId, input.inspectionVanId)
    if (vehicle) {
      return {
        state: 'resolved',
        source: 'inspection_van_id',
        vehicle,
        legacyVanNumber: extractLegacyVanNumber(input.metadata),
        uploadSessionId: input.uploadSessionId,
      }
    }
  }

  const uploadSession = await loaders.loadUploadSession(
    input.tenantId,
    input.businessId,
    input.uploadSessionId,
    input.inspectionId
  )
  if (uploadSession?.vanId) {
    const vehicle = await loaders.loadVehicleById(input.tenantId, uploadSession.vanId)
    if (vehicle) {
      return {
        state: 'resolved',
        source: 'upload_session_van_id',
        vehicle,
        legacyVanNumber: extractLegacyVanNumber(input.metadata),
        uploadSessionId: uploadSession.id,
      }
    }
  }

  const legacyVanNumber = extractLegacyVanNumber(input.metadata)
  if (legacyVanNumber) {
    const matches = await loaders.loadVehiclesByNumber(input.tenantId, legacyVanNumber, 2)
    if (matches.length === 1) {
      return {
        state: 'resolved',
        source: 'legacy_van_number',
        vehicle: matches[0],
        legacyVanNumber,
        uploadSessionId: uploadSession?.id ?? input.uploadSessionId,
      }
    }
    if (matches.length > 1) {
      return {
        state: 'ambiguous',
        source: 'legacy_van_number',
        vehicle: null,
        legacyVanNumber,
        uploadSessionId: uploadSession?.id ?? input.uploadSessionId,
      }
    }
  }

  return {
    state: 'missing',
    source: 'none',
    vehicle: null,
    legacyVanNumber,
    uploadSessionId: uploadSession?.id ?? input.uploadSessionId,
  }
}

export type VehicleImageCandidate = {
  id: string
  imageRole: string | null
  createdAt: string
  uploadOrder?: number | null
  originalFileIndex?: number | null
}

function nestedRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export function selectVehicleProfileImage(
  vehicleMetadata: Record<string, unknown>,
  candidates: VehicleImageCandidate[],
  options: { allowAutomaticFirstUpload?: boolean } = {}
) {
  const vanDamage = nestedRecord(vehicleMetadata.vanDamage)
  const profileImage = nestedRecord(vanDamage.profileImage)
  const featuredImage = nestedRecord(vanDamage.featuredImage)
  const explicitProfileId = stringValue(profileImage.imageId)
  const explicitFeaturedId =
    stringValue(featuredImage.imageId) ?? stringValue(vanDamage.featuredImageId)
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]))

  if (explicitProfileId && byId.has(explicitProfileId)) {
    return { imageId: explicitProfileId, source: 'primary_profile' as const }
  }
  if (explicitFeaturedId && byId.has(explicitFeaturedId)) {
    return { imageId: explicitFeaturedId, source: 'featured_fleet' as const }
  }

  const approvedRoles = new Set([
    'vehicle_profile',
    'profile',
    'fleet_profile',
    'featured',
    'front',
  ])
  const approved = candidates
    .filter((candidate) => candidate.imageRole && approvedRoles.has(candidate.imageRole))
    .sort(
      (left, right) =>
        Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id)
    )[0]
  if (approved) return { imageId: approved.id, source: 'approved_vehicle_image' as const }

  if (options.allowAutomaticFirstUpload) {
    const firstUpload = [...candidates].sort(
      (left, right) =>
        (left.uploadOrder ?? left.originalFileIndex ?? Number.MAX_SAFE_INTEGER) -
          (right.uploadOrder ?? right.originalFileIndex ?? Number.MAX_SAFE_INTEGER) ||
        Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
        left.id.localeCompare(right.id)
    )[0]
    if (firstUpload) {
      return { imageId: firstUpload.id, source: 'automatic_first_upload' as const }
    }
  }

  return { imageId: null, source: 'placeholder' as const }
}
