import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export type EncryptedSecret = {
  ciphertext: string
  iv: string
  authTag: string
  version: 'v1'
}

export function getTokenEncryptionKey(value = process.env.SLACK_TOKEN_ENCRYPTION_KEY): Buffer {
  if (!value) throw new Error('SLACK_TOKEN_ENCRYPTION_KEY is not configured')

  const raw = Buffer.from(value, 'utf8')
  if (raw.length === 32) return raw

  const normalized = value.trim()
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new Error('SLACK_TOKEN_ENCRYPTION_KEY must be a 32-byte UTF-8 string or base64 value')
  }

  const decoded = Buffer.from(normalized, 'base64')
  if (decoded.length !== 32) {
    throw new Error('SLACK_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes')
  }
  return decoded
}

export function encryptSecret(plainText: string): EncryptedSecret {
  if (!plainText) throw new Error('Cannot encrypt an empty secret')
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', getTokenEncryptionKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    version: 'v1',
  }
}

export function decryptSecret(secret: EncryptedSecret): string {
  if (secret.version !== 'v1') throw new Error(`Unsupported encrypted secret version: ${String(secret.version)}`)
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getTokenEncryptionKey(),
    Buffer.from(secret.iv, 'base64'),
  )
  decipher.setAuthTag(Buffer.from(secret.authTag, 'base64'))
  return Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

export function maskToken(token: string): string {
  const last4 = token.slice(-4)
  return last4 ? `••••${last4}` : '••••'
}
