import { getTokenEncryptionKey } from '../../../lib/server/crypto/encrypt-token.js'
import { getConfig } from './config.js'
import { assertGeminiInitialized } from './gemini-damage-analysis.js'
import { initializeLogger, logger } from './logger.js'
import { processMessageBody } from './process-job.js'
import { S3Storage } from './s3-storage.js'
import { assertSlackClientInitialized } from './slack-client.js'
import { VanDamageSqsConsumer } from './sqs-consumer.js'
import { SupabaseWorker } from './supabase-worker.js'

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000

async function main() {
  const config = getConfig()
  initializeLogger(config.logLevel)

  assertGeminiInitialized(config)
  assertSlackClientInitialized()
  getTokenEncryptionKey(config.encryptionKey)

  const persistence = new SupabaseWorker(config)
  const storage = new S3Storage(config)
  const consumer = new VanDamageSqsConsumer(
    config,
    (body, metadata) => processMessageBody(body, { config, persistence, storage }, metadata),
  )

  logger.info('Worker dependencies initialized', {
    region: config.awsRegion,
    geminiModel: config.geminiModel,
    nodeEnv: config.nodeEnv,
  })

  const stop = (signal: string) => {
    logger.info('Shutdown requested', { signal })
    consumer.stop()
  }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))

  const heartbeat = setInterval(() => {
    logger.info('Worker Alive', {
      pid: process.pid,
      uptimeSeconds: Math.floor(process.uptime()),
    })
  }, HEARTBEAT_INTERVAL_MS)
  heartbeat.unref()

  try {
    await consumer.run()
  } finally {
    clearInterval(heartbeat)
  }
}

main().catch((error) => {
  logger.error('Worker terminated unexpectedly', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
})
