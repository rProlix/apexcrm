// app/api/pov/events/[eventRef]/logout/route.ts
// Public: clears the current guest session for an event.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveEvent } from '@/lib/pov/events'
import { destroyGuestSession } from '@/lib/pov/guestSession'

interface RouteCtx { params: Promise<{ eventRef: string }> }

export async function POST(_req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const event = await resolveEvent(eventRef)
  if (event) await destroyGuestSession(event.id)
  return NextResponse.json({ ok: true })
}
