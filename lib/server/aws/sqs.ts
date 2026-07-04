import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { getVanDamageAwsEnv } from '@/lib/server/env'
import { vanDamageJobSchema, type VanDamageJobV1 } from '@/lib/van-damage/contracts'

let client: SQSClient | null = null

function sqsClient(region: string) {
  client ??= new SQSClient({ region, maxAttempts: 2 })
  return client
}

export async function sendVanDamageJob(payload: VanDamageJobV1): Promise<string> {
  const validPayload = vanDamageJobSchema.parse(payload)
  const { region, queueUrl } = getVanDamageAwsEnv()
  const response = await sqsClient(region).send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(validPayload),
    MessageAttributes: {
      version: { DataType: 'String', StringValue: validPayload.version },
      jobType: { DataType: 'String', StringValue: validPayload.jobType },
    },
  }), { abortSignal: AbortSignal.timeout(2_000) })
  if (!response.MessageId) throw new Error('SQS did not return a message ID')
  return response.MessageId
}
