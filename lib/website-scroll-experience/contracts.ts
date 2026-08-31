import { z } from 'zod'

export const SCROLL_EXPERIENCE_PROCESSING_VERSION = 'scroll-video-v1'

export const scrollExperienceJobSchema = z.object({
  version: z.literal('1'),
  jobType: z.literal('scroll_experience_video'),
  tenantId: z.string().uuid(),
  experienceId: z.string().uuid(),
  experienceVersionId: z.string().uuid(),
  sourceAssetId: z.string().uuid(),
  processingVersion: z.string().min(1).max(80),
  idempotencyKey: z.string().min(1).max(320),
})

export type ScrollExperienceJobV1 = z.infer<typeof scrollExperienceJobSchema>

export const SCROLL_EXPERIENCE_STATUSES = [
  'UPLOADING',
  'UPLOADED',
  'QUEUED',
  'INSPECTING',
  'PROCESSING_DESKTOP',
  'PROCESSING_MOBILE',
  'GENERATING_POSTER',
  'READY',
  'FAILED',
  'ARCHIVED',
] as const

export type ScrollExperienceStatus = (typeof SCROLL_EXPERIENCE_STATUSES)[number]

export function buildScrollExperienceObjectKey(input: {
  tenantId: string
  experienceId: string
  experienceVersionId: string
  kind: 'source' | 'desktop' | 'mobile' | 'poster'
}) {
  const ext = input.kind === 'poster' ? 'webp' : 'mp4'
  const file = input.kind === 'source' ? `original.${ext}` : `${input.kind}.${ext}`
  return [
    'tenants',
    input.tenantId,
    'website-builder',
    'scroll-experiences',
    input.experienceId,
    input.experienceVersionId,
    input.kind,
    file,
  ].join('/')
}

export function buildScrollExperienceIdempotencyKey(
  tenantId: string,
  experienceId: string,
  processingVersion: string
) {
  return `${tenantId}:${experienceId}:${processingVersion}`
}

export function isMp4Signature(bytes: Uint8Array) {
  if (bytes.length < 12) return false
  const marker = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7])
  return marker === 'ftyp'
}
