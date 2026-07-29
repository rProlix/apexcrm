import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { PutBucketLifecycleConfigurationCommand, S3Client } from '@aws-sdk/client-s3'

const __dirname = dirname(fileURLToPath(import.meta.url))
const bucket = process.env.VAN_DAMAGE_S3_BUCKET || process.env.S3_BUCKET
const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'

if (!bucket) {
  console.error('Missing VAN_DAMAGE_S3_BUCKET or S3_BUCKET.')
  process.exit(1)
}

const policyPath = resolve(
  __dirname,
  '../infrastructure/van-damage-image-lifecycle/s3-lifecycle-policy.json'
)
const LifecycleConfiguration = JSON.parse(await readFile(policyPath, 'utf8'))
const client = new S3Client({ region, maxAttempts: 3 })

await client.send(
  new PutBucketLifecycleConfigurationCommand({
    Bucket: bucket,
    LifecycleConfiguration,
  })
)

console.log(`Applied van damage image lifecycle policy to ${bucket} in ${region}.`)
