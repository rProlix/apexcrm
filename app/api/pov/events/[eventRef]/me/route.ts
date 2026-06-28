// app/api/pov/events/[eventRef]/me/route.ts
// Public: current guest session status + gallery lock state for an event.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveEvent, isGalleryUnlocked } from '@/lib/pov/events'
import { getGuestFromSession } from '@/lib/pov/guestSession'

interface RouteCtx { params: Promise<{ eventRef: string }> }

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const event = await resolveEvent(eventRef)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const guest = await getGuestFromSession(event.id)
  const galleryLocked = !isGalleryUnlocked(event)

  return NextResponse.json({
    loggedIn:        !!guest,
    authenticated:   !!guest, // backwards-compatible alias
    guest: guest ? { id: guest.id, event_id: guest.event_id, display_name: guest.display_name } : null,
    event: { id: event.id, name: event.name, slug: event.slug },
    galleryLocked,
    galleryRevealAt: event.gallery_reveal_at,
  })
}
