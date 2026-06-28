// app/api/pov/events/[eventRef]/guest/register-or-login/route.ts
// Public: register a new guest or log in an existing one with phone + PIN.
// Issues an httpOnly guest-session cookie. Never returns PIN hashes.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveEvent } from '@/lib/pov/events'
import { povDb } from '@/lib/pov/db'
import {
  normalizePhone, isValidPin, hashPin, verifyPin, generatePinSalt,
} from '@/lib/pov/crypto'
import { createGuestSession } from '@/lib/pov/guestSession'
import { randomBytes } from 'crypto'
import type { PovGuestRow } from '@/lib/pov/types'

interface RouteCtx { params: Promise<{ eventRef: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const event = await resolveEvent(eventRef)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!event.is_active) {
    return NextResponse.json({ error: 'This event is not currently active.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const phoneRaw = String(body.phone_number ?? '')
  const pin = String(body.pin ?? '')
  const displayName = body.display_name ? String(body.display_name).trim().slice(0, 80) : null

  const phoneNormalized = normalizePhone(phoneRaw)
  if (!phoneNormalized || phoneNormalized.replace(/\D/g, '').length < 7) {
    return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }

  if (event.require_pin && !isValidPin(pin)) {
    return NextResponse.json({ error: 'PIN must be 4–8 digits.' }, { status: 400 })
  }

  const db = povDb()

  const { data: existing } = await db
    .from('pov_guests')
    .select('*')
    .eq('event_id', event.id)
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle()

  let guest: PovGuestRow

  if (existing) {
    if (event.require_pin) {
      const ok = verifyPin(pin, existing.pin_salt ?? '', existing.pin_hash ?? '')
      if (!ok) {
        return NextResponse.json(
          { error: 'Incorrect PIN for this phone number.' },
          { status: 401 },
        )
      }
    }
    const { data: updated } = await db
      .from('pov_guests')
      .update({
        last_login_at: new Date().toISOString(),
        ...(displayName ? { display_name: displayName } : {}),
      })
      .eq('id', existing.id)
      .select('*')
      .single()
    guest = (updated ?? existing) as PovGuestRow
  } else {
    // Create new guest. For no-PIN events, store an unguessable random hash so
    // the NOT NULL constraint holds; it is never used for verification.
    const salt = generatePinSalt()
    const pinToHash = event.require_pin ? pin : randomBytes(16).toString('hex')
    const { data: created, error: insErr } = await db
      .from('pov_guests')
      .insert({
        tenant_id:        event.tenant_id,
        event_id:         event.id,
        phone_number:     phoneRaw.trim().slice(0, 32),
        phone_normalized: phoneNormalized,
        display_name:     displayName,
        pin_hash:         hashPin(pinToHash, salt),
        pin_salt:         salt,
        last_login_at:    new Date().toISOString(),
      })
      .select('*')
      .single()

    if (insErr || !created) {
      return NextResponse.json(
        { error: insErr?.message ?? 'Could not register guest.' },
        { status: 500 },
      )
    }
    guest = created as PovGuestRow
  }

  await createGuestSession({ tenantId: event.tenant_id, eventId: event.id, guestId: guest.id })

  return NextResponse.json({
    guest: { id: guest.id, event_id: guest.event_id, display_name: guest.display_name },
  })
}
