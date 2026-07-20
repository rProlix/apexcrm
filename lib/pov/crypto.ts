// lib/pov/crypto.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY cryptography helpers for the POV Event App.
//
// Guests authenticate with a phone number + PIN. We NEVER store the raw PIN —
// it is hashed with scrypt + a per-guest random salt. Session tokens are random
// and only their SHA-256 hash is stored in pov_guest_sessions.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { randomBytes, scryptSync, createHash, timingSafeEqual } from 'crypto'

const SCRYPT_KEYLEN = 64

/** Generates a random salt (hex) for a new guest. */
export function generatePinSalt(): string {
  return randomBytes(16).toString('hex')
}

/** Hashes a PIN with scrypt using the provided salt. Returns hex. */
export function hashPin(pin: string, salt: string): string {
  return scryptSync(pin, salt, SCRYPT_KEYLEN).toString('hex')
}

/** Constant-time verification of a PIN against a stored hash + salt. */
export function verifyPin(pin: string, salt: string, expectedHash: string): boolean {
  try {
    const actual = scryptSync(pin, salt, SCRYPT_KEYLEN)
    const expected = Buffer.from(expectedHash, 'hex')
    if (actual.length !== expected.length) return false
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** Validates a PIN: digits only, 4–8 characters. */
export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin)
}

/**
 * Normalizes a phone number to a comparable canonical form.
 * Strips everything except digits and a leading +. US-style 10-digit numbers
 * get a default +1 prefix. This is deliberately conservative — it does not aim
 * to be a full libphonenumber, just stable normalization for dedupe + lookup.
 */
export function normalizePhone(raw: string): string {
  const trimmed = (raw ?? '').trim()
  const hasPlus = trimmed.startsWith('+')
  const digits = trimmed.replace(/[^\d]/g, '')
  if (!digits) return ''
  if (hasPlus) return `+${digits}`
  if (digits.length === 10) return `+1${digits}`        // US national → E.164-ish
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

/** Generates a guest session token and its stored hash. */
export function generateSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex')
  return { token, tokenHash: hashSessionToken(token) }
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Builds a URL-safe, globally-unique-in-practice event slug from a name.
 * Appends a short random suffix so public /pov/[slug] routing never collides
 * across tenants.
 */
export function generateEventSlug(name: string): string {
  const base = (name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'event'
  const suffix = randomBytes(3).toString('hex') // 6 hex chars
  return `${base}-${suffix}`
}
