// lib/pov/guestSession.ts
// ─────────────────────────────────────────────────────────────────────────────
// SERVER-ONLY lightweight guest session management for the POV Event App.
//
// Guests are NOT Supabase Auth users. After phone + PIN verification we issue a
// random session token, store only its SHA-256 hash in pov_guest_sessions, and
// set it in an httpOnly cookie. The raw token never touches the database and the
// hash never leaves the server.
// ─────────────────────────────────────────────────────────────────────────────

import 'server-only'
import { cookies } from 'next/headers'
import { povDb, purgeExpiredSessions } from '@/lib/pov/db'
import { generateSessionToken, hashSessionToken } from '@/lib/pov/crypto'
import type { PovGuestRow } from '@/lib/pov/types'

const COOKIE_PREFIX = 'pov_sid_'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7 // 7 days

function cookieName(eventId: string): string {
  // Scope the cookie per-event so a guest can attend multiple events.
  return `${COOKIE_PREFIX}${eventId}`
}

/**
 * Creates a guest session row + sets the httpOnly cookie. Must be called from a
 * route handler (where cookies() is writable).
 */
export async function createGuestSession(params: {
  tenantId: string
  eventId:  string
  guestId:  string
}): Promise<void> {
  const { tenantId, eventId, guestId } = params
  const { token, tokenHash } = generateSessionToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString()

  await povDb().from('pov_guest_sessions').insert({
    tenant_id:          tenantId,
    event_id:           eventId,
    guest_id:           guestId,
    session_token_hash: tokenHash,
    expires_at:         expiresAt,
  })

  const store = await cookies()
  store.set(cookieName(eventId), token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path:     '/',
    maxAge:   SESSION_TTL_SECONDS,
  })
}

/**
 * Resolves the current guest for an event from the httpOnly cookie. Returns the
 * full guest row (caller is responsible for not leaking pin fields) or null.
 */
export async function getGuestFromSession(eventId: string): Promise<PovGuestRow | null> {
  const store = await cookies()
  const token = store.get(cookieName(eventId))?.value
  if (!token) return null

  const tokenHash = hashSessionToken(token)
  const db = povDb()

  const { data: session } = await db
    .from('pov_guest_sessions')
    .select('id, guest_id, event_id, expires_at')
    .eq('session_token_hash', tokenHash)
    .eq('event_id', eventId)
    .maybeSingle()

  if (!session) return null
  if (new Date(session.expires_at).getTime() < Date.now()) {
    void purgeExpiredSessions(eventId)
    return null
  }

  const { data: guest } = await db
    .from('pov_guests')
    .select('*')
    .eq('id', session.guest_id)
    .maybeSingle()

  return (guest as PovGuestRow | null) ?? null
}

/** Clears the guest session cookie and deletes the server-side session row. */
export async function destroyGuestSession(eventId: string): Promise<void> {
  const store = await cookies()
  const token = store.get(cookieName(eventId))?.value
  if (token) {
    try {
      await povDb()
        .from('pov_guest_sessions')
        .delete()
        .eq('session_token_hash', hashSessionToken(token))
    } catch {
      // non-fatal
    }
  }
  store.delete(cookieName(eventId))
}
