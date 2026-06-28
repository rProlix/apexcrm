// app/api/pov/events/[eventRef]/media/upload/route.ts
// Public (guest-session): upload a photo, 15s video clip, or 30s audio message.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { resolveEvent } from '@/lib/pov/events'
import { getGuestFromSession } from '@/lib/pov/guestSession'
import { povDb } from '@/lib/pov/db'
import { uploadPovMedia, detectMediaType, deletePovMediaObject } from '@/lib/pov/media'
import {
  POV_ALLOWED_MIME, POV_MAX_BYTES, POV_MEDIA_TYPES, type PovMediaType,
} from '@/lib/pov/types'

interface RouteCtx { params: Promise<{ eventRef: string }> }

// Small grace margin so a "15s" clip recorded at 15.4s isn't rejected.
const DURATION_GRACE = 2.5

export async function POST(req: NextRequest, { params }: RouteCtx) {
  const { eventRef } = await params
  const event = await resolveEvent(eventRef)
  if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  if (!event.is_active) {
    return NextResponse.json({ error: 'This event is not currently active.' }, { status: 403 })
  }

  const guest = await getGuestFromSession(event.id)
  if (!guest) return NextResponse.json({ error: 'Please enter the event first.' }, { status: 401 })

  const form = await req.formData().catch(() => null)
  if (!form) return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })

  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided.' }, { status: 400 })

  const caption = form.get('caption') ? String(form.get('caption')).slice(0, 500) : null
  const clientDuration = form.get('duration_seconds')
    ? Number(form.get('duration_seconds')) : null

  // Determine media type — explicit field wins, else infer from mime.
  let mediaType = String(form.get('media_type') ?? '') as PovMediaType
  if (!POV_MEDIA_TYPES.includes(mediaType)) {
    const detected = detectMediaType(file.type)
    if (!detected) {
      return NextResponse.json({ error: `Unsupported file type "${file.type}".` }, { status: 415 })
    }
    mediaType = detected
  }

  // Event-level toggles.
  if (mediaType === 'photo' && !event.allow_photos) {
    return NextResponse.json({ error: 'Photos are turned off for this event.' }, { status: 403 })
  }
  if (mediaType === 'video' && !event.allow_videos) {
    return NextResponse.json({ error: 'Video clips are turned off for this event.' }, { status: 403 })
  }
  if (mediaType === 'audio' && !event.allow_audio) {
    return NextResponse.json({ error: 'Audio messages are turned off for this event.' }, { status: 403 })
  }

  // Server-side type validation.
  if (!POV_ALLOWED_MIME[mediaType].includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported ${mediaType} format "${file.type}".` },
      { status: 415 },
    )
  }

  // Server-side size validation.
  if (file.size > POV_MAX_BYTES[mediaType]) {
    return NextResponse.json(
      { error: `File is too large. Max ${(POV_MAX_BYTES[mediaType] / 1024 / 1024).toFixed(0)} MB.` },
      { status: 413 },
    )
  }

  // Duration validation (client-reported — browsers don't expose server-side
  // probing without ffmpeg; we still enforce when a value is provided).
  if (mediaType === 'video' && clientDuration != null && Number.isFinite(clientDuration)) {
    if (clientDuration > event.video_max_seconds + DURATION_GRACE) {
      return NextResponse.json(
        { error: `Video must be ${event.video_max_seconds} seconds or less.` },
        { status: 422 },
      )
    }
  }
  if (mediaType === 'audio' && clientDuration != null && Number.isFinite(clientDuration)) {
    if (clientDuration > event.audio_max_seconds + DURATION_GRACE) {
      return NextResponse.json(
        { error: `Audio must be ${event.audio_max_seconds} seconds or less.` },
        { status: 422 },
      )
    }
  }

  // Upload to storage.
  let uploaded
  try {
    uploaded = await uploadPovMedia({
      tenantId:  event.tenant_id,
      eventId:   event.id,
      guestId:   guest.id,
      mediaType,
      fileName:  file.name || `${mediaType}`,
      buffer:    await file.arrayBuffer(),
      mimeType:  file.type,
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upload failed.' },
      { status: 500 },
    )
  }

  const { data: media, error } = await povDb()
    .from('pov_media')
    .insert({
      tenant_id:        event.tenant_id,
      event_id:         event.id,
      guest_id:         guest.id,
      media_type:       mediaType,
      storage_provider: 'supabase',
      bucket:           uploaded.bucket,
      storage_path:     uploaded.path,
      public_url:       uploaded.publicUrl,
      mime_type:        uploaded.mimeType,
      file_size_bytes:  uploaded.sizeBytes,
      duration_seconds: clientDuration ?? null,
      caption,
      status:           'approved',
      metadata:         {
        original_name: file.name,
        // Duration is measured client-side (recorder elapsed / <video> metadata)
        // and re-validated server-side above. Full server-side probing would need
        // ffmpeg — tracked in POV diagnostics as a known limitation.
        duration_source: clientDuration != null ? 'client_reported' : 'unknown',
        duration_server_enforced: clientDuration != null,
      },
    })
    .select('*')
    .single()

  if (error) {
    // Roll back the orphaned storage object.
    await deletePovMediaObject(uploaded.path)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ media }, { status: 201 })
}
