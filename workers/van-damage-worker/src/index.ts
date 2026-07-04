import { getConfig } from './config.js'
import { logger } from './logger.js'
import { VanDamageSqsConsumer } from './sqs-consumer.js'

async function main() {
  const consumer = new VanDamageSqsConsumer(getConfig())
  const stop = (signal: string) => {
    logger.info('Shutdown requested', { signal })
    consumer.stop()
  }
  process.once('SIGINT', () => stop('SIGINT'))
  process.once('SIGTERM', () => stop('SIGTERM'))
  await consumer.run()
}

main().catch((error) => {
  logger.error('Worker terminated unexpectedly', { error: error instanceof Error ? error.message : String(error) })
  process.exitCode = 1
})
