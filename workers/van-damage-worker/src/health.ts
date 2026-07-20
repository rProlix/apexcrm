import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { getTokenEncryptionKey } from '../../../lib/server/crypto/encrypt-token.js'
import { getConfig } from './config.js'
import { assertGeminiInitialized } from './gemini-damage-analysis.js'
import { assertSlackClientInitialized } from './slack-client.js'
import { SupabaseWorker } from './supabase-worker.js'

export type HealthStatus = 'Healthy' | 'Warning' | 'Unhealthy'
type Check = { ok: boolean; required: boolean; detail: string }

async function check(
  name: string,
  required: boolean,
  fn: () => Promise<string | void> | string | void,
): Promise<[string, Check]> {
  try {
    const detail = await fn()
    return [name, { ok: true, required, detail: detail || 'Connection verified' }]
  } catch (error) {
    return [name, {
      ok: false,
      required,
      detail: error instanceof Error ? error.message : String(error),
    }]
  }
}

export async function runHealth() {
  const config = getConfig()
  const sts = new STSClient({ region: config.awsRegion, maxAttempts: 2 })
  const sqs = new SQSClient({ region: config.awsRegion, maxAttempts: 2 })
  const s3 = new S3Client({ region: config.awsRegion, maxAttempts: 2 })
  const supabase = new SupabaseWorker(config)
  const entries = await Promise.all([
    check('awsIdentity', false, async () => {
      const identity = await sts.send(new GetCallerIdentityCommand({}))
      return identity.Account ? `Authenticated to AWS account ${identity.Account}` : undefined
    }),
    check('sqs', true, async () => {
      await sqs.send(new GetQueueAttributesCommand({ QueueUrl: config.queueUrl, AttributeNames: ['QueueArn'] }))
      return 'Queue attributes retrieved'
    }),
    check('s3', true, async () => {
      await s3.send(new HeadBucketCommand({ Bucket: config.bucket }))
      return 'Bucket is reachable'
    }),
    check('supabase', true, async () => {
      const contract = await supabase.checkSchemaCompatibility()
      return `Connected; schema ${contract.version}`
    }),
    check('gemini', true, () => assertGeminiInitialized(config)),
    check('slack', true, () => {
      assertSlackClientInitialized()
      getTokenEncryptionKey(config.encryptionKey)
      return 'Client runtime and token decryption are initialized'
    }),
  ])
  const checks = Object.fromEntries(entries)
  const requiredFailures = entries.filter(([, result]) => result.required && !result.ok)
  const warnings = entries.filter(([, result]) => !result.required && !result.ok)
  const status: HealthStatus = requiredFailures.length
    ? 'Unhealthy'
    : warnings.length
      ? 'Warning'
      : 'Healthy'
  const failures = requiredFailures.length ? requiredFailures : warnings
  const reason = failures.length
    ? failures.map(([name, result]) => `${name}: ${result.detail}`).join('; ')
    : 'All required services and client initializations passed'
  return { status, reason, ok: status !== 'Unhealthy', checks }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHealth().then((report) => {
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.status === 'Unhealthy' ? 1 : 0
  }).catch((error) => {
    console.error(JSON.stringify({
      status: 'Unhealthy',
      reason: error instanceof Error ? error.message : String(error),
      ok: false,
      checks: {},
    }, null, 2))
    process.exitCode = 1
  })
}
