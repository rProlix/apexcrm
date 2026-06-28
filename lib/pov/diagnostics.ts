// lib/pov/diagnostics.ts
// SERVER-ONLY admin diagnostics for a POV Event App.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { povDb } from '@/lib/pov/db'
import { isGalleryUnlocked } from '@/lib/pov/events'
import { STORAGE_BUCKETS } from '@/lib/storage/buckets'
import type { PovEventRow } from '@/lib/pov/types'

export interface PovDiagnostics {
  website_type:    string | null
  event_id:        string
  slug:            string
  reveal_at:       string
  timezone:        string
  gallery_unlocked: boolean
  is_active:       boolean
  counts:          { guests: number; media: number; photos: number; videos: number; audio: number; sessions: number }
  upload_settings: { allow_photos: boolean; allow_videos: boolean; allow_audio: boolean; video_max_seconds: number; audio_max_seconds: number; require_pin: boolean }
  storage:         { bucket: string; exists: boolean; public: boolean | null; error: string | null }
  public_route:    string
}

async function count(table: string, build: (q: any) => any): Promise<number> {
  const { count: c } = await build(povDb().from(table).select('id', { count: 'exact', head: true }))
  return c ?? 0
}

export async function buildPovDiagnostics(event: PovEventRow, publicBase: string): Promise<PovDiagnostics> {
  const db = getSupabaseServerClient()

  const [websiteTypeRes, bucketRes, guests, media, photos, videos, audio, sessions] = await Promise.all([
    db.from('site_settings').select('*').eq('tenant_id', event.tenant_id).maybeSingle(),
    db.storage.getBucket(STORAGE_BUCKETS.EVENT_MEDIA),
    count('pov_guests', (q) => q.eq('event_id', event.id)),
    count('pov_media', (q) => q.eq('event_id', event.id).neq('status', 'deleted')),
    count('pov_media', (q) => q.eq('event_id', event.id).eq('media_type', 'photo').neq('status', 'deleted')),
    count('pov_media', (q) => q.eq('event_id', event.id).eq('media_type', 'video').neq('status', 'deleted')),
    count('pov_media', (q) => q.eq('event_id', event.id).eq('media_type', 'audio').neq('status', 'deleted')),
    count('pov_guest_sessions', (q) => q.eq('event_id', event.id)),
  ])

  const websiteType = (websiteTypeRes.data as Record<string, unknown> | null)?.website_type as string | null ?? null

  return {
    website_type:     websiteType,
    event_id:         event.id,
    slug:             event.slug,
    reveal_at:        event.gallery_reveal_at,
    timezone:         event.timezone,
    gallery_unlocked: isGalleryUnlocked(event),
    is_active:        event.is_active,
    counts:           { guests, media, photos, videos, audio, sessions },
    upload_settings:  {
      allow_photos: event.allow_photos, allow_videos: event.allow_videos, allow_audio: event.allow_audio,
      video_max_seconds: event.video_max_seconds, audio_max_seconds: event.audio_max_seconds, require_pin: event.require_pin,
    },
    storage: {
      bucket: STORAGE_BUCKETS.EVENT_MEDIA,
      exists: !bucketRes.error && !!bucketRes.data,
      public: bucketRes.data?.public ?? null,
      error:  bucketRes.error?.message ?? null,
    },
    public_route: `${publicBase}/pov/${event.slug}`,
  }
}
