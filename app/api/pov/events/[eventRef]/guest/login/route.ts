// app/api/pov/events/[eventRef]/guest/login/route.ts
// Public: log an EXISTING guest back in (phone + PIN). No account → clear error.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveEvent } from '@/lib/pov/events'
import { povDb } from '@/lib/pov/db'
import { normalizePhone, isValidPin, verifyPin } from '@/lib/pov/crypto'
import { createGuestSession } from '@/lib/pov/guestSession'
import type { PovGuestRow } from '@/lib/pov/types'

interface RouteCtx { params: Promise<{ eventRef: string }> }

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const event = await resolveEvent(eventRef)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!event.is_active) {
    return NextResponse.json({ error: 'This event is not currently active.' }, { status: 403 })
  }
  if (!event.allow_guest_login) {
    return NextResponse.json({ error: 'Guest login is turned off for this event.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const phoneRaw = String(body.phone_number ?? '')
  const pin = String(body.pin ?? '')

  const phoneNormalized = normalizePhone(phoneRaw)
  if (!phoneNormalized || phoneNormalized.replace(/\D/g, '').length < 7) {
    return NextResponse.json({ error: 'Please enter a valid phone number.' }, { status: 400 })
  }
  if (event.require_pin && !isValidPin(pin)) {
    return NextResponse.json({ error: 'PIN must be 4–8 digits.' }, { status: 400 })
  }

  const db = povDb()

  const { data: guestRow } = await db
    .from('pov_guests')
    .select('*')
    .eq('event_id', event.id)
    .eq('phone_normalized', phoneNormalized)
    .maybeSingle()

  if (!guestRow) {
    return NextResponse.json(
      { error: 'No account found. Create a guest account first.', code: 'not_found' },
      { status: 404 },
    )
  }

  const guest = guestRow as PovGuestRow

  if (event.require_pin) {
    const ok = verifyPin(pin, guest.pin_salt ?? '', guest.pin_hash ?? '')
    if (!ok) {
      return NextResponse.json({ error: 'Incorrect PIN for this phone number.' }, { status: 401 })
    }
  }

  await db.from('pov_guests').update({ last_login_at: new Date().toISOString() }).eq('id', guest.id)
  await createGuestSession({ tenantId: event.tenant_id, eventId: event.id, guestId: guest.id })

  return NextResponse.json({
    guest: { id: guest.id, event_id: guest.event_id, display_name: guest.display_name },
  })
}
