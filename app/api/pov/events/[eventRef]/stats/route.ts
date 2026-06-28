// app/api/pov/events/[eventRef]/stats/route.ts
// Admin: guest count + media counts (by type) for an event.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { authorizeEventAdmin } from '@/lib/pov/admin'
import { povDb } from '@/lib/pov/db'
import { isGalleryUnlocked } from '@/lib/pov/events'

interface RouteCtx { params: Promise<{ eventRef: string }> }

async function count(table: string, build: (q: any) => any): Promise<number> {
  const { count: c } = await build(
    povDb().from(table).select('id', { count: 'exact', head: true }),
  )
  return c ?? 0
}

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const auth = await authorizeEventAdmin(eventRef)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const eventId = auth.event.id

  const [guests, photos, videos, audio, total, pending, reported, hidden] = await Promise.all([
    count('pov_guests', (q) => q.eq('event_id', eventId)),
    count('pov_media', (q) => q.eq('event_id', eventId).eq('media_type', 'photo').neq('status', 'deleted')),
    count('pov_media', (q) => q.eq('event_id', eventId).eq('media_type', 'video').neq('status', 'deleted')),
    count('pov_media', (q) => q.eq('event_id', eventId).eq('media_type', 'audio').neq('status', 'deleted')),
    count('pov_media', (q) => q.eq('event_id', eventId).neq('status', 'deleted')),
    count('pov_media', (q) => q.eq('event_id', eventId).eq('status', 'pending')),
    count('pov_media', (q) => q.eq('event_id', eventId).eq('status', 'reported')),
    count('pov_media', (q) => q.eq('event_id', eventId).eq('status', 'hidden')),
  ])

  return NextResponse.json({
    stats: {
      guests,
      media: total,
      photos,
      videos,
      audio,
      pending,
      reported,
      hidden,
      unlocked: isGalleryUnlocked(auth.event),
      reveal_at: auth.event.gallery_reveal_at,
    },
  })
}
