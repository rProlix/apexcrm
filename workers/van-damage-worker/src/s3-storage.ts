import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { WorkerConfig } from './config.js'

export function safeFileName(value: string) {
  const cleaned = value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
  return cleaned.slice(0, 160) || 'image'
}

export function buildOriginalKey(input: {
  tenantId: string; businessId: string; inspectionId: string; slackFileId: string; fileName: string
}) {
  return `tenants/${input.tenantId}/van-damage/${input.businessId}/inspections/${input.inspectionId}/original/${safeFileName(input.slackFileId)}-${safeFileName(input.fileName)}`
}

export class S3Storage {
  private client: S3Client
  constructor(private config: WorkerConfig) {
    this.client = new S3Client({ region: config.awsRegion, maxAttempts: 3 })
  }

  async uploadOriginal(input: {
    tenantId: string; businessId: string; inspectionId: string; slackFileId: string
    fileName: string; contentType: string; body: Buffer
  }) {
    const key = buildOriginalKey(input)
    const result = await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      Metadata: {
        tenant_id: input.tenantId,
        business_id: input.businessId,
        inspection_id: input.inspectionId,
        slack_file_id: input.slackFileId,
      },
    }))
    return { bucket: this.config.bucket, key, etag: result.ETag?.replaceAll('"', '') ?? null }
  }
}
