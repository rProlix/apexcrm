import { createHash } from 'crypto'

export const IMAGE_LIFECYCLE_POLICY_VERSION = 'image-lifecycle-v1'
export const IMAGE_PREPROCESSING_VERSION = 'van-image-preprocess-v1'
export const IMAGE_QUALITY_TASK_VERSION = 'image-quality-v1'
export const DAMAGE_ANALYSIS_TASK_VERSION = 'van-damage-v3'
export const DERIVATIVE_RENDER_VERSION = 'derivative-render-v1'

export type ImageDerivativeProfile = 'thumbnail' | 'medium' | 'large'
export type ImageAssetType = 'original' | ImageDerivativeProfile | 'overlay' | 'export'
export type AnalysisTaskType =
  | 'image_quality'
  | 'camera_angle'
  | 'damage_detection'
  | 'before_after_comparison'
  | 'repair_verification'
  | 'overlay_generation'

export type RetentionPlan = 'standard' | 'extended_3_year' | 'extended_5_year' | 'extended_7_year' | 'custom'

export type RetentionInput = {
  plan?: RetentionPlan | null
  assetType: ImageAssetType
  uploadedAt: string | Date
  legalHold?: boolean
  vehicleArchived?: boolean
  deletionGraceDays?: number | null
  customOriginalRetentionDays?: number | null
  customDerivativeRetentionDays?: number | null
}

export type RetentionResolution = {
  policyVersion: string
  retainUntil: string | null
  deletionEligibleAt: string | null
  lifecycleState: 'active' | 'archive_eligible' | 'delete_blocked' | 'delete_eligible'
  reason: string
}

export const DERIVATIVE_PROFILES: Record<
  ImageDerivativeProfile,
  { maxDimension: number; quality: number; minimumQuality: number; targetBytes: number }
> = {
  thumbnail: { maxDimension: 480, quality: 78, minimumQuality: 58, targetBytes: 100_000 },
  medium: { maxDimension: 1600, quality: 82, minimumQuality: 64, targetBytes: 600_000 },
  large: { maxDimension: 2800, quality: 86, minimumQuality: 70, targetBytes: 1_500_000 },
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash('sha256').update(data).digest('hex')
}

export function sanitizeObjectPathSegment(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 160) || 'asset'
  )
}

export function extensionForMime(mimeType: string, fallbackFileName = 'image'): string {
  const normalized = mimeType.toLowerCase().split(';')[0].trim()
  if (EXTENSION_BY_MIME[normalized]) return EXTENSION_BY_MIME[normalized]
  const candidate = fallbackFileName.split('.').pop()?.toLowerCase() ?? ''
  return ['jpg', 'jpeg', 'png', 'webp'].includes(candidate) ? (candidate === 'jpeg' ? 'jpg' : candidate) : 'bin'
}

export function buildVanDamageObjectKey(input: {
  tenantId: string
  vehicleId?: string | null
  inspectionId: string
  imageId: string
  assetType: ImageAssetType
  fileName?: string | null
  contentType?: string | null
  version?: string | null
}): string {
  const vehicle = input.vehicleId ? sanitizeObjectPathSegment(input.vehicleId) : 'unassigned'
  const base = [
    'tenants',
    sanitizeObjectPathSegment(input.tenantId),
    'vehicles',
    vehicle,
    'inspections',
    sanitizeObjectPathSegment(input.inspectionId),
    'images',
    sanitizeObjectPathSegment(input.imageId),
  ].join('/')
  if (input.assetType === 'original') {
    const extension = extensionForMime(input.contentType ?? '', input.fileName ?? 'image')
    const name = sanitizeObjectPathSegment(input.fileName ?? `original.${extension}`)
    const withoutExtension = name.replace(/\.[a-z0-9]{1,8}$/i, '') || 'original'
    return `${base}/original/${withoutExtension}.${extension}`
  }
  if (input.assetType === 'overlay') {
    return `${base}/overlays/${sanitizeObjectPathSegment(input.version ?? DERIVATIVE_RENDER_VERSION)}.webp`
  }
  if (input.assetType === 'export') {
    return `${base}/exports/${sanitizeObjectPathSegment(input.version ?? 'export')}.pdf`
  }
  return `${base}/derivatives/${input.assetType}-${DERIVATIVE_RENDER_VERSION}.webp`
}

export function assertTenantScopedObjectKey(key: string, tenantId: string): void {
  const expectedPrefix = `tenants/${sanitizeObjectPathSegment(tenantId)}/`
  if (!key.startsWith(expectedPrefix)) throw new Error('Object key is outside the tenant scope.')
  if (key.includes('..') || key.includes('//')) throw new Error('Object key contains an unsafe path segment.')
}

export function buildAiCacheKey(input: {
  tenantId: string
  imageSha256: string
  taskType: AnalysisTaskType
  taskVersion: string
  promptVersion?: string | null
  modelCapabilityVersion: string
  preprocessingVersion?: string | null
  comparisonReferenceSha256?: string | null
  configurationVersion?: string | null
}): string {
  const payload = {
    tenantId: input.tenantId,
    imageSha256: input.imageSha256,
    taskType: input.taskType,
    taskVersion: input.taskVersion,
    promptVersion: input.promptVersion ?? null,
    modelCapabilityVersion: input.modelCapabilityVersion,
    preprocessingVersion: input.preprocessingVersion ?? IMAGE_PREPROCESSING_VERSION,
    comparisonReferenceSha256: input.comparisonReferenceSha256 ?? null,
    configurationVersion: input.configurationVersion ?? IMAGE_LIFECYCLE_POLICY_VERSION,
  }
  return sha256Hex(JSON.stringify(payload))
}

export function resolveImageRetentionPolicy(input: RetentionInput): RetentionResolution {
  const uploadedAt = input.uploadedAt instanceof Date ? input.uploadedAt : new Date(input.uploadedAt)
  const graceDays = input.deletionGraceDays ?? 30
  if (input.legalHold) {
    return {
      policyVersion: IMAGE_LIFECYCLE_POLICY_VERSION,
      retainUntil: null,
      deletionEligibleAt: null,
      lifecycleState: 'delete_blocked',
      reason: 'Legal hold blocks deletion.',
    }
  }
  const originalDays =
    input.plan === 'extended_7_year'
      ? 2555
      : input.plan === 'extended_5_year'
        ? 1825
        : input.plan === 'extended_3_year'
          ? 1095
          : input.plan === 'custom' && input.customOriginalRetentionDays
            ? input.customOriginalRetentionDays
            : 365
  const derivativeDays =
    input.plan === 'custom' && input.customDerivativeRetentionDays
      ? input.customDerivativeRetentionDays
      : input.vehicleArchived
        ? 180
        : 365
  const retainDays = input.assetType === 'original' ? originalDays : derivativeDays
  const retainUntil = addDays(uploadedAt, retainDays)
  const deletionEligibleAt = addDays(retainUntil, graceDays)
  const now = Date.now()
  return {
    policyVersion: IMAGE_LIFECYCLE_POLICY_VERSION,
    retainUntil: retainUntil.toISOString(),
    deletionEligibleAt: deletionEligibleAt.toISOString(),
    lifecycleState:
      now >= deletionEligibleAt.getTime()
        ? 'delete_eligible'
        : input.vehicleArchived || now >= retainUntil.getTime()
          ? 'archive_eligible'
          : 'active',
    reason:
      input.assetType === 'original'
        ? `Original evidence retained for ${retainDays} days plus ${graceDays} grace days.`
        : `Derivative retained for ${retainDays} days plus ${graceDays} grace days.`,
  }
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 86_400_000)
}
