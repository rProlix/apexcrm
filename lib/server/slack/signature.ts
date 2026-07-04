import { createHmac, timingSafeEqual } from 'node:crypto'

export function verifySlackSignature(input: {
  body: string
  timestamp: string | null
  signature: string | null
  signingSecret: string
  nowSeconds?: number
}): boolean {
  const { body, timestamp, signature, signingSecret } = input
  if (!timestamp || !signature || !/^v0=[a-f0-9]{64}$/i.test(signature)) return false
  const timestampNumber = Number(timestamp)
  if (!Number.isFinite(timestampNumber)) return false
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(now - timestampNumber) > 60 * 5) return false

  const expected = `v0=${createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${body}`)
    .digest('hex')}`
  const suppliedBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer)
}
