// app/api/pov/events/[eventRef]/media/route.ts
// GET — gallery feed.
//   Admin  : all media, any time, any status (optionally filtered).
//   Guest  : approved media ONLY after gallery_reveal_at. Before reveal returns
//            a locked payload with the reveal time (never the media itself).

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveEvent, isGalleryUnlocked } from '@/lib/pov/events'
import { getGuestFromSession } from '@/lib/pov/guestSession'
import { getUserContext } from '@/lib/auth/getUserContext'
import { canManageEvent } from '@/lib/pov/admin'
import { povDb } from '@/lib/pov/db'
import { POV_MEDIA_TYPES, type PovMediaType, type PovMediaRow } from '@/lib/pov/types'

interface RouteCtx { params: Promise<{ eventRef: string }> }

async function attachGuestNames(rows: PovMediaRow[]): Promise<Array<PovMediaRow & { guest_name: string | null }>> {
  const ids = Array.from(new Set(rows.map((r) => r.guest_id).filter(Boolean))) as string[]
  const nameById = new Map<string, string | null>()
  if (ids.length) {
    const { data } = await povDb().from('pov_guests').select('id, display_name').in('id', ids)
    for (const g of data ?? []) nameById.set(g.id, g.display_name ?? null)
  }
  return rows.map((r) => ({ ...r, guest_name: r.guest_id ? (nameById.get(r.guest_id) ?? null) : null }))
}

export async function GET(req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const event = await resolveEvent(eventRef)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  const typeFilter = req.nextUrl.searchParams.get('media_type')
  const validType = typeFilter && POV_MEDIA_TYPES.includes(typeFilter as PovMediaType)
    ? (typeFilter as PovMediaType) : null

  // Admin path — full access regardless of reveal time.
  let isAdmin = false
  try {
    const ctx = await getUserContext()
    if (ctx) isAdmin = canManageEvent(ctx, event)
  } catch { /* anonymous */ }

  if (isAdmin) {
    const statusFilter = req.nextUrl.searchParams.get('status')
    let q = povDb().from('pov_media').select('*')
      .eq('event_id', event.id)
      .order('created_at', { ascending: false })
    if (validType) q = q.eq('media_type', validType)
    if (statusFilter) q = q.eq('status', statusFilter)
    else q = q.neq('status', 'deleted')
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const media = await attachGuestNames((data ?? []) as PovMediaRow[])
    return NextResponse.json({
      mode: 'admin',
      unlocked: isGalleryUnlocked(event),
      reveal_at: event.gallery_reveal_at,
      media,
    })
  }

  // Guest path — must be reveal time.
  const unlocked = isGalleryUnlocked(event)
  if (!unlocked) {
    return NextResponse.json({
      mode: 'guest',
      unlocked: false,
      locked: true,
      reveal_at: event.gallery_reveal_at,
      message: event.gallery_locked_message,
      media: [],
    })
  }

  // Optional: require an active guest session to view the revealed gallery.
  const guest = await getGuestFromSession(event.id)
  if (!guest) {
    return NextResponse.json({ error: 'Please enter the event first.' }, { status: 401 })
  }

  let q = povDb().from('pov_media').select('*')
    .eq('event_id', event.id)
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
  if (validType) q = q.eq('media_type', validType)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const media = await attachGuestNames((data ?? []) as PovMediaRow[])
  return NextResponse.json({
    mode: 'guest',
    unlocked: true,
    reveal_at: event.gallery_reveal_at,
    message: event.gallery_unlocked_message,
    media,
  })
}
