// app/api/pov/events/[eventRef]/route.ts
// GET  — public-safe event info (+ admin extras when authorized)
// PATCH — admin: update event settings
// DELETE — admin: delete event (cascades guests/media/sessions)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveEvent, isGalleryUnlocked } from '@/lib/pov/events'
import { authorizeEventAdmin, canManageEvent } from '@/lib/pov/admin'
import { getUserContext } from '@/lib/auth/getUserContext'
import { povDb } from '@/lib/pov/db'
import { POV_EVENT_TYPES, type PovEventType } from '@/lib/pov/types'

interface RouteCtx { params: Promise<{ eventRef: string }> }

/** Strips a full event row down to fields safe to expose to public guests. */
function toPublic(event: Awaited<ReturnType<typeof resolveEvent>>) {
  if (!event) return null
  const unlocked = isGalleryUnlocked(event)
  const s = event.settings ?? {}
  return {
    id:                       event.id,
    name:                     event.name,
    slug:                     event.slug,
    event_type:               event.event_type,
    event_date:               event.event_date,
    event_start_at:           event.event_start_at,
    timezone:                 event.timezone,
    gallery_reveal_at:        event.gallery_reveal_at,
    is_active:                event.is_active,
    allow_photos:             event.allow_photos,
    allow_videos:             event.allow_videos,
    allow_audio:              event.allow_audio,
    video_max_seconds:        event.video_max_seconds,
    audio_max_seconds:        event.audio_max_seconds,
    require_pin:              event.require_pin,
    allow_guest_login:        event.allow_guest_login,
    allow_guest_registration: event.allow_guest_registration,
    gallery_locked_message:   event.gallery_locked_message,
    gallery_unlocked_message: event.gallery_unlocked_message,
    theme:                    event.theme ?? {},
    headline:                 (s as Record<string, unknown>).headline ?? null,
    subheadline:              (s as Record<string, unknown>).subheadline ?? null,
    upload_instructions:      (s as Record<string, unknown>).upload_instructions ?? null,
    upload_success_message:   (s as Record<string, unknown>).upload_success_message ?? null,
    unlocked,
  }
}

export async function GET(_req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const event = await resolveEvent(eventRef)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

  // Attach admin extras if the caller can manage the event.
  let isAdmin = false
  try {
    const ctx = await getUserContext()
    if (ctx) isAdmin = canManageEvent(ctx, event)
  } catch { /* anonymous */ }

  if (isAdmin) {
    return NextResponse.json({ event, public: toPublic(event), isAdmin: true })
  }
  return NextResponse.json({ public: toPublic(event), isAdmin: false })
}

const PATCHABLE_BOOL = [
  'is_active', 'allow_photos', 'allow_videos', 'allow_audio', 'require_pin',
  'allow_guest_login', 'allow_guest_registration',
] as const
const PATCHABLE_TEXT = [
  'name', 'gallery_locked_message', 'gallery_unlocked_message', 'timezone',
] as const

export async function PATCH(req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const auth = await authorizeEventAdmin(eventRef)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const patch: Record<string, unknown> = {}

  for (const k of PATCHABLE_BOOL) if (k in body) patch[k] = Boolean(body[k])
  for (const k of PATCHABLE_TEXT) if (k in body) patch[k] = String(body[k])

  if ('event_type' in body && POV_EVENT_TYPES.includes(body.event_type as PovEventType)) {
    patch.event_type = body.event_type
  }
  if ('event_date' in body) patch.event_date = body.event_date || null
  if ('gallery_reveal_at' in body && body.gallery_reveal_at) {
    patch.gallery_reveal_at = new Date(String(body.gallery_reveal_at)).toISOString()
  }
  if ('event_start_at' in body) {
    patch.event_start_at = body.event_start_at ? new Date(String(body.event_start_at)).toISOString() : null
  }
  if ('video_max_seconds' in body) patch.video_max_seconds = Number(body.video_max_seconds)
  if ('audio_max_seconds' in body) patch.audio_max_seconds = Number(body.audio_max_seconds)
  if ('theme' in body && typeof body.theme === 'object' && body.theme) patch.theme = body.theme
  if ('settings' in body && typeof body.settings === 'object' && body.settings) {
    patch.settings = { ...(auth.event.settings ?? {}), ...(body.settings as object) }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ event: auth.event })
  }

  const { data, error } = await povDb()
    .from('pov_events')
    .update(patch)
    .eq('id', auth.event.id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ event: data })
}

export async function DELETE(_req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const auth = await authorizeEventAdmin(eventRef)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { error } = await povDb().from('pov_events').delete().eq('id', auth.event.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
