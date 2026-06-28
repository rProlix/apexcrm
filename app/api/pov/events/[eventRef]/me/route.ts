// app/api/pov/events/[eventRef]/me/route.ts
// Public: returns the current guest session status for an event.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveEvent } from '@/lib/pov/events'
import { getGuestFromSession } from '@/lib/pov/guestSession'

interface RouteCtx { params: Promise<{ eventRef: string }> }

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const event = await resolveEvent(eventRef)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const guest = await getGuestFromSession(event.id)
  if (!guest) return NextResponse.json({ authenticated: false, guest: null })

  return NextResponse.json({
    authenticated: true,
    guest: { id: guest.id, event_id: guest.event_id, display_name: guest.display_name },
  })
}
