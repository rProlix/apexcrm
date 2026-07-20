import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  type Message,
} from '@aws-sdk/client-sqs'
import type { WorkerConfig } from './config.js'
import { logger } from './logger.js'
import { processMessageBody, type JobRuntimeMetadata, type ProcessResult } from './process-job.js'

function messageIdentifiers(body: string) {
  try {
    const value = JSON.parse(body) as Record<string, unknown>
    return {
      ...(typeof value.jobId === 'string' ? { jobId: value.jobId } : {}),
      ...(typeof value.inspectionId === 'string' ? { inspectionId: value.inspectionId } : {}),
      ...(typeof value.tenantId === 'string' ? { tenantId: value.tenantId } : {}),
    }
  } catch {
    return {}
  }
}

export class VanDamageSqsConsumer {
  private client: SQSClient
  private stopping = false

  constructor(
    private config: WorkerConfig,
    private processor: (body: string, metadata?: JobRuntimeMetadata) => Promise<ProcessResult> =
      (body, metadata) => processMessageBody(body, undefined, metadata),
  ) {
    this.client = new SQSClient({ region: config.awsRegion, maxAttempts: 3 })
  }

  stop() { this.stopping = true }

  async run() {
    logger.info('Van Damage worker started', { concurrency: this.config.concurrency, region: this.config.awsRegion })
    while (!this.stopping) {
      try {
        const response = await this.client.send(new ReceiveMessageCommand({
          QueueUrl: this.config.queueUrl,
          MaxNumberOfMessages: 5,
          WaitTimeSeconds: 20,
          VisibilityTimeout: this.config.visibilityTimeoutSeconds,
          MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        }))
        const messages = response.Messages ?? []
        for (let index = 0; index < messages.length; index += this.config.concurrency) {
          await Promise.all(messages.slice(index, index + this.config.concurrency).map((message) => this.handleMessage(message)))
        }
      } catch (error) {
        logger.error('SQS receive loop failed', { error: error instanceof Error ? error.message : String(error) })
        await new Promise((resolve) => setTimeout(resolve, 2_000))
      }
    }
    logger.info('Van Damage worker stopped')
  }

  private async handleMessage(message: Message) {
    if (!message.Body || !message.ReceiptHandle) {
      logger.warn('SQS message missing body or receipt handle', { messageId: message.MessageId })
      return
    }
    const receiveCount = Number(message.Attributes?.ApproximateReceiveCount ?? '1')
    const metadata: JobRuntimeMetadata = {
      sqsMessageId: message.MessageId,
      receiveCount: Number.isFinite(receiveCount) ? receiveCount : 1,
      retryCount: Number.isFinite(receiveCount) ? Math.max(receiveCount - 1, 0) : 0,
    }
    logger.info('SQS queue receive', {
      ...messageIdentifiers(message.Body),
      messageId: message.MessageId,
      receiveCount: metadata.receiveCount,
      retryCount: metadata.retryCount,
    })
    const intervalMs = Math.max(30, Math.floor(this.config.visibilityTimeoutSeconds / 2)) * 1000
    const heartbeat = setInterval(() => {
      void this.client.send(new ChangeMessageVisibilityCommand({
        QueueUrl: this.config.queueUrl,
        ReceiptHandle: message.ReceiptHandle,
        VisibilityTimeout: this.config.visibilityTimeoutSeconds,
      })).catch((error) => logger.warn('Visibility heartbeat failed', {
        messageId: message.MessageId,
        error: error instanceof Error ? error.message : String(error),
      }))
    }, intervalMs)
    heartbeat.unref()

    try {
      const result = await this.processor(message.Body, metadata)
      if (result === 'success') {
        await this.client.send(new DeleteMessageCommand({
          QueueUrl: this.config.queueUrl,
          ReceiptHandle: message.ReceiptHandle,
        }))
        logger.info('SQS message deleted', {
          ...messageIdentifiers(message.Body),
          messageId: message.MessageId,
          retryCount: metadata.retryCount,
        })
      } else {
        logger.warn('SQS message retained for retry', {
          ...messageIdentifiers(message.Body),
          messageId: message.MessageId,
          retryCount: metadata.retryCount,
        })
      }
    } finally {
      clearInterval(heartbeat)
    }
  }
}
