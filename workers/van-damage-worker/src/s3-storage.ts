import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import sharp from 'sharp'
import {
  DERIVATIVE_PROFILES,
  DERIVATIVE_RENDER_VERSION,
  buildVanDamageObjectKey,
  type ImageDerivativeProfile,
} from '../../../lib/van-damage/image-lifecycle.js'
import type { WorkerConfig } from './config.js'

export function safeFileName(value: string) {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return cleaned.slice(0, 160) || 'image'
}

export function buildOriginalKey(input: {
  tenantId: string
  businessId: string
  inspectionId: string
  slackFileId: string
  fileName: string
  imageId?: string
  vehicleId?: string | null
  contentType?: string
}) {
  if (input.imageId) {
    return buildVanDamageObjectKey({
      tenantId: input.tenantId,
      vehicleId: input.vehicleId,
      inspectionId: input.inspectionId,
      imageId: input.imageId,
      assetType: 'original',
      fileName: `${safeFileName(input.slackFileId)}-${safeFileName(input.fileName)}`,
      contentType: input.contentType,
    })
  }
  return `tenants/${input.tenantId}/van-damage/${input.businessId}/inspections/${input.inspectionId}/original/${safeFileName(input.slackFileId)}-${safeFileName(input.fileName)}`
}

export type UploadedDerivative = {
  profile: ImageDerivativeProfile
  bucket: string
  key: string
  etag: string | null
  contentType: 'image/webp'
  size: number
  width: number | null
  height: number | null
  quality: number
  version: string
}

export class S3Storage {
  private client: S3Client
  constructor(private config: WorkerConfig) {
    this.client = new S3Client({ region: config.awsRegion, maxAttempts: 3 })
  }

  async uploadOriginal(input: {
    tenantId: string
    businessId: string
    inspectionId: string
    slackFileId: string
    imageId?: string
    vehicleId?: string | null
    fileName: string
    contentType: string
    body: Buffer
    sha256?: string
  }) {
    const key = buildOriginalKey(input)
    const result = await this.client.send(
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: input.body,
        ContentType: input.contentType,
        Metadata: {
          tenant_id: input.tenantId,
          business_id: input.businessId,
          inspection_id: input.inspectionId,
          slack_file_id: input.slackFileId,
          ...(input.imageId ? { image_id: input.imageId } : {}),
          ...(input.sha256 ? { sha256: input.sha256 } : {}),
        },
        Tagging: lifecycleTags({
          tenantId: input.tenantId,
          assetType: 'original',
          evidenceClass: 'original',
          retentionClass: 'standard',
        }),
      })
    )
    return { bucket: this.config.bucket, key, etag: result.ETag?.replaceAll('"', '') ?? null }
  }

  async uploadDerivatives(input: {
    tenantId: string
    businessId: string
    inspectionId: string
    imageId: string
    vehicleId?: string | null
    body: Buffer
  }): Promise<UploadedDerivative[]> {
    const source = sharp(input.body, {
      failOn: 'none',
      limitInputPixels: 80_000_000,
    }).rotate()
    const sourceMetadata = await source.metadata()
    const derivatives: UploadedDerivative[] = []
    for (const profile of Object.keys(DERIVATIVE_PROFILES) as ImageDerivativeProfile[]) {
      const config = DERIVATIVE_PROFILES[profile]
      let quality = config.quality
      let encoded = await encodeDerivative(input.body, config.maxDimension, quality)
      while (encoded.buffer.length > config.targetBytes && quality > config.minimumQuality) {
        quality = Math.max(config.minimumQuality, quality - 6)
        encoded = await encodeDerivative(input.body, config.maxDimension, quality)
      }
      const key = buildVanDamageObjectKey({
        tenantId: input.tenantId,
        vehicleId: input.vehicleId,
        inspectionId: input.inspectionId,
        imageId: input.imageId,
        assetType: profile,
      })
      const result = await this.client.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: key,
          Body: encoded.buffer,
          ContentType: 'image/webp',
          CacheControl: 'private, max-age=31536000, immutable',
          Metadata: {
            tenant_id: input.tenantId,
            business_id: input.businessId,
            inspection_id: input.inspectionId,
            image_id: input.imageId,
            derivative_profile: profile,
            derivative_version: DERIVATIVE_RENDER_VERSION,
            source_width: String(sourceMetadata.width ?? ''),
            source_height: String(sourceMetadata.height ?? ''),
          },
          Tagging: lifecycleTags({
            tenantId: input.tenantId,
            assetType: profile,
            evidenceClass: 'derivative',
            retentionClass: profile === 'thumbnail' ? 'hot' : 'standard',
          }),
        })
      )
      derivatives.push({
        profile,
        bucket: this.config.bucket,
        key,
        etag: result.ETag?.replaceAll('"', '') ?? null,
        contentType: 'image/webp',
        size: encoded.buffer.length,
        width: encoded.width,
        height: encoded.height,
        quality,
        version: DERIVATIVE_RENDER_VERSION,
      })
    }
    return derivatives
  }
}

async function encodeDerivative(body: Buffer, maxDimension: number, quality: number) {
  const image = sharp(body, { failOn: 'none', limitInputPixels: 80_000_000 })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality, effort: 4 })
  const buffer = await image.toBuffer()
  const metadata = await sharp(buffer).metadata()
  return { buffer, width: metadata.width ?? null, height: metadata.height ?? null }
}

function lifecycleTags(input: {
  tenantId: string
  assetType: string
  evidenceClass: 'original' | 'derivative'
  retentionClass: string
}) {
  const params = new URLSearchParams({
    'tenant-id': input.tenantId,
    'asset-type': input.assetType,
    'evidence-class': input.evidenceClass,
    'retention-class': input.retentionClass,
    'lifecycle-policy-version': 'image-lifecycle-v1',
    'legal-hold': 'false',
  })
  return params.toString()
}
