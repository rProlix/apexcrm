import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3'
import { GetQueueAttributesCommand, SQSClient } from '@aws-sdk/client-sqs'
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import { getTokenEncryptionKey } from '../../../lib/server/crypto/encrypt-token.js'
import { getConfig } from './config.js'
import { SupabaseWorker } from './supabase-worker.js'

type Check = { ok: boolean; detail?: string }

async function check(name: string, fn: () => Promise<string | void>): Promise<[string, Check]> {
  try {
    const detail = await fn()
    return [name, { ok: true, ...(detail ? { detail } : {}) }]
  } catch (error) {
    return [name, { ok: false, detail: error instanceof Error ? error.message : String(error) }]
  }
}

export async function runHealth() {
  const config = getConfig()
  const sts = new STSClient({ region: config.awsRegion, maxAttempts: 2 })
  const sqs = new SQSClient({ region: config.awsRegion, maxAttempts: 2 })
  const s3 = new S3Client({ region: config.awsRegion, maxAttempts: 2 })
  const supabase = new SupabaseWorker(config)
  const entries = await Promise.all([
    check('awsIdentity', async () => {
      const identity = await sts.send(new GetCallerIdentityCommand({}))
      return identity.Account ? `account ${identity.Account}` : undefined
    }),
    check('sqs', async () => {
      await sqs.send(new GetQueueAttributesCommand({ QueueUrl: config.queueUrl, AttributeNames: ['QueueArn'] }))
    }),
    check('s3', async () => { await s3.send(new HeadBucketCommand({ Bucket: config.bucket })) }),
    check('supabase', async () => {
      const contract = await supabase.checkSchemaCompatibility()
      return `schema ${contract.version}`
    }),
    check('gemini', async () => { if (!config.geminiApiKey) throw new Error('GEMINI_API_KEY missing') }),
    check('encryption', async () => { getTokenEncryptionKey(config.encryptionKey) }),
  ])
  const checks = Object.fromEntries(entries)
  const ok = entries.every(([, result]) => result.ok)
  return { ok, checks }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runHealth().then((report) => {
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.ok ? 0 : 1
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
