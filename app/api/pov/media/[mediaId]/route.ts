// app/api/pov/media/[mediaId]/route.ts
// PATCH  — admin: approve / hide / report / archive (delete) / update caption.
// DELETE — admin, OR the owning guest before reveal (soft-deletes + removes object).

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { canManageEvent } from '@/lib/pov/admin'
import { resolveEvent, isGalleryUnlocked } from '@/lib/pov/events'
import { getGuestFromSession } from '@/lib/pov/guestSession'
import { povDb } from '@/lib/pov/db'
import { deletePovMediaObject } from '@/lib/pov/media'
import { POV_MEDIA_STATUSES, type PovMediaRow, type PovMediaStatus } from '@/lib/pov/types'

interface RouteCtx { params: Promise<{ mediaId: string }> }

async function loadMedia(id: string): Promise<PovMediaRow | null> {
  const { data } = await povDb().from('pov_media').select('*').eq('id', id).maybeSingle()
  return (data as PovMediaRow | null) ?? null
}

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { mediaId } = await params
  const media = await loadMedia(mediaId)
  if (!media) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

  const ctx = await getUserContext()
  const event = await resolveEvent(media.event_id)
  if (!ctx || !event || !canManageEvent(ctx, event)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  if ('status' in body) {
    const s = String(body.status) as PovMediaStatus
    if (!POV_MEDIA_STATUSES.includes(s)) {
      return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
    }
    patch.status = s
  }
  if ('caption' in body) patch.caption = body.caption ? String(body.caption).slice(0, 500) : null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ media })
  }

  const { data, error } = await povDb()
    .from('pov_media').update(patch).eq('id', mediaId).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ media: data })
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const { mediaId } = await params
  const media = await loadMedia(mediaId)
  if (!media) return NextResponse.json({ error: 'Media not found' }, { status: 404 })

  const event = await resolveEvent(media.event_id)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Admin path.
  let authorized = false
  try {
    const ctx = await getUserContext()
    if (ctx && canManageEvent(ctx, event)) authorized = true
  } catch { /* anonymous */ }

  // Guest path — only the owning guest, only before reveal.
  if (!authorized) {
    const guest = await getGuestFromSession(event.id)
    if (guest && media.guest_id === guest.id && !isGalleryUnlocked(event)) {
      authorized = true
    }
  }

  if (!authorized) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Remove the underlying object, then hard-delete the row.
  await deletePovMediaObject(media.storage_path)
  const { error } = await povDb().from('pov_media').delete().eq('id', mediaId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
