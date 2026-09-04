import 'server-only'

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'

type CipherEnvelope = { v: 1; iv: string; tag: string; data: string }

function encryptionKey(): Buffer {
  const configured = process.env.REWARDS_TOKEN_ENCRYPTION_KEY?.trim()
  if (!configured) throw new Error('REWARDS_TOKEN_ENCRYPTION_KEY is not configured')
  const raw = Buffer.from(configured, 'base64')
  if (raw.length !== 32) {
    throw new Error('REWARDS_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key')
  }
  return raw
}

export function generateOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashRewardToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

export function encryptRewardToken(value: string): string {
  if (!value) throw new Error('Cannot encrypt an empty reward token')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  const envelope: CipherEnvelope = {
    v: 1,
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    data: encrypted.toString('base64url'),
  }
  return Buffer.from(JSON.stringify(envelope)).toString('base64url')
}

export function decryptRewardToken(value: string): string {
  const envelope = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as CipherEnvelope
  if (envelope.v !== 1) throw new Error('Unsupported reward token encryption version')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(envelope.iv, 'base64url')
  )
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

export function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashRewardToken(token), 'hex')
  const expected = Buffer.from(expectedHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export function safeTokenSuffix(token: string): string {
  return token.slice(-4)
}
