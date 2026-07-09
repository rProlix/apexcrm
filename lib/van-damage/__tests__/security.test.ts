import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac, randomUUID } from 'node:crypto'
import { decryptSecret, encryptSecret, maskToken } from '../../server/crypto/encrypt-token'
import { createSlackOAuthState, verifySlackOAuthState } from '../../server/slack/oauth-state'
import { verifySlackSignature } from '../../server/slack/signature'
import { normalizeSlackImageEvent, sanitizeSlackEvent } from '../../server/slack/events'
import { vanDamageJobSchema } from '../contracts'

const originalKey = process.env.SLACK_TOKEN_ENCRYPTION_KEY
process.env.SLACK_TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012'

test.after(() => {
  if (originalKey === undefined) delete process.env.SLACK_TOKEN_ENCRYPTION_KEY
  else process.env.SLACK_TOKEN_ENCRYPTION_KEY = originalKey
})

test('AES-GCM token encryption round-trips and rejects tampering', () => {
  const encrypted = encryptSecret('example-secret-1234')
  assert.equal(decryptSecret(encrypted), 'example-secret-1234')
  assert.equal(maskToken('example-secret-1234'), '••••1234')
  assert.throws(() => decryptSecret({ ...encrypted, ciphertext: `${encrypted.ciphertext.slice(0, -2)}AA` }))
})

test('Slack OAuth state binds tenant, user, nonce and expiry signature', () => {
  const tenantId = randomUUID()
  const generated = createSlackOAuthState({ tenantId, businessId: tenantId, userId: randomUUID() })
  const verified = verifySlackOAuthState(generated.state, generated.payload.nonce)
  assert.equal(verified.businessId, tenantId)
  assert.throws(() => verifySlackOAuthState(`${generated.state}x`, generated.payload.nonce))
  assert.throws(() => verifySlackOAuthState(generated.state, 'wrong-nonce'))
})

test('Slack signature verifies raw body and rejects replay', () => {
  const body = JSON.stringify({ type: 'event_callback' })
  const timestamp = '1700000000'
  const secret = 'signing-secret'
  const signature = `v0=${createHmac('sha256', secret).update(`v0:${timestamp}:${body}`).digest('hex')}`
  assert.equal(verifySlackSignature({ body, timestamp, signature, signingSecret: secret, nowSeconds: 1700000010 }), true)
  assert.equal(verifySlackSignature({ body: `${body} `, timestamp, signature, signingSecret: secret, nowSeconds: 1700000010 }), false)
  assert.equal(verifySlackSignature({ body, timestamp, signature, signingSecret: secret, nowSeconds: 1700001000 }), false)
})

test('Slack event normalization accepts supported image messages and strips private URLs from audit', () => {
  const payload = {
    type: 'event_callback', team_id: 'T1', event_id: 'Ev1', token: 'legacy-token',
    event: {
      type: 'message', channel: 'C1', user: 'U1', ts: '1.0001', text: 'Inspect this van',
      files: [{ id: 'F1', name: 'van.jpg', mimetype: 'image/jpeg', url_private_download: 'https://private.example/file' }],
    },
  }
  const normalized = normalizeSlackImageEvent(payload)
  assert.equal(normalized.kind, 'image_message')
  const audit = JSON.stringify(sanitizeSlackEvent(payload))
  assert.equal(audit.includes('private.example'), false)
  assert.equal(audit.includes('legacy-token'), false)
})

test('SQS contract enforces tenant/business alias and contains no secret fields', () => {
  const tenantId = randomUUID()
  const payload = vanDamageJobSchema.parse({
    version: 'v1', jobType: 'van_damage_slack_inspection', jobId: randomUUID(),
    tenantId, businessId: tenantId, integrationId: randomUUID(), inspectionId: randomUUID(),
    slackTeamId: 'T1', slackChannelId: 'C1', slackMessageTs: '1.0001', slackThreadTs: null,
    slackEventId: 'Ev1', slackMessageText: 'van #64', slackFileIds: ['F1'], createdAt: new Date().toISOString(),
  })
  assert.equal(payload.slackMessageText, 'van #64')
  assert.equal(/token|secret|credential/i.test(JSON.stringify(payload)), false)
  assert.equal(vanDamageJobSchema.safeParse({ ...payload, businessId: randomUUID() }).success, false)
})
