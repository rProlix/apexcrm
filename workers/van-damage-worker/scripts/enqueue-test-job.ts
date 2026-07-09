import 'dotenv/config'
import { randomUUID } from 'node:crypto'
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'
import { vanDamageJobSchema } from '../../../lib/van-damage/contracts.js'

if (process.env.NODE_ENV === 'production' && process.env.ALLOW_WORKER_TEST_ENQUEUE !== 'true') {
  throw new Error('Refusing to enqueue a test job in production without ALLOW_WORKER_TEST_ENQUEUE=true')
}

const queueUrl = process.env.VAN_DAMAGE_SQS_QUEUE_URL
const region = process.env.AWS_REGION
if (!queueUrl || !region) throw new Error('AWS_REGION and VAN_DAMAGE_SQS_QUEUE_URL are required')

const tenantId = process.env.TEST_TENANT_ID ?? randomUUID()
const message = vanDamageJobSchema.parse({
  version: 'v1',
  jobType: 'van_damage_slack_inspection',
  jobId: process.env.TEST_JOB_ID ?? randomUUID(),
  tenantId,
  businessId: tenantId,
  integrationId: process.env.TEST_INTEGRATION_ID ?? randomUUID(),
  inspectionId: process.env.TEST_INSPECTION_ID ?? randomUUID(),
  slackTeamId: process.env.TEST_SLACK_TEAM_ID ?? 'T_TEST',
  slackChannelId: process.env.TEST_SLACK_CHANNEL_ID ?? 'C_TEST',
  slackMessageTs: `${Math.floor(Date.now() / 1000)}.000001`,
  slackThreadTs: null,
  slackEventId: `Ev_TEST_${Date.now()}`,
  slackMessageText: process.env.TEST_SLACK_MESSAGE_TEXT ?? 'van #64',
  slackFileIds: [process.env.TEST_SLACK_FILE_ID ?? 'F_TEST'],
  createdAt: new Date().toISOString(),
})

const result = await new SQSClient({ region }).send(new SendMessageCommand({
  QueueUrl: queueUrl,
  MessageBody: JSON.stringify(message),
}))
console.log(JSON.stringify({ messageId: result.MessageId, jobId: message.jobId }, null, 2))
