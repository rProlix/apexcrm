// lib/pov/createEvent.ts
// SERVER-ONLY. Shared POV/event creation used by both /api/pov/events and the
// unified /api/websites/create endpoint, so there is ONE creation path.

import 'server-only'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { povDb } from '@/lib/pov/db'
import { generateEventSlug } from '@/lib/pov/crypto'
import { defaultRevealAt } from '@/lib/pov/events'
import { generatePovDefaults } from '@/lib/pov/aiDefaults'
import { ensureInvitationPages } from '@/lib/pov/invitationPages'
import { ensureWebsiteRegistry } from '@/lib/website/registry'
import { POV_EVENT_TYPES, type PovEventType } from '@/lib/pov/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

export interface CreatePovEventInput {
  tenantId: string
  name: string
  websiteType: 'pov_event' | 'invitational'
  createdBy?: string | null
  businessId?: string | null
  event_type?: string
  event_date?: string | null
  event_start_at?: string | null
  event_end_at?: string | null
  gallery_reveal_at?: string | null
  timezone?: string
  is_active?: boolean
  allow_photos?: boolean
  allow_videos?: boolean
  allow_audio?: boolean
  video_max_seconds?: number
  audio_max_seconds?: number
  require_pin?: boolean
  allow_guest_login?: boolean
  allow_guest_registration?: boolean
  gallery_locked_message?: string
  gallery_unlocked_message?: string
  theme_key?: string
  theme?: Record<string, unknown>
  settings?: Record<string, unknown>
}

export interface CreatePovEventResult { event?: AnyRow; error?: string }

export async function createPovEventRecord(input: CreatePovEventInput): Promise<CreatePovEventResult> {
  const { tenantId } = input
  const name = String(input.name ?? '').trim()
  if (!name) return { error: 'Event name is required.' }

  const eventType = POV_EVENT_TYPES.includes(input.event_type as PovEventType)
    ? (input.event_type as PovEventType) : 'other'
  const timezone = input.timezone || 'America/Los_Angeles'
  const eventDate = input.event_date || null
  const revealAt = input.gallery_reveal_at
    ? new Date(input.gallery_reveal_at).toISOString()
    : defaultRevealAt({ eventDate, timezone })

  const defaults = generatePovDefaults(eventType)
  const themeKey = input.theme_key || defaults.theme_key

  const db = povDb()

  let slug = generateEventSlug(name)
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: clash } = await db.from('pov_events').select('id')
      .eq('tenant_id', tenantId).eq('slug', slug).maybeSingle()
    if (!clash) break
    slug = generateEventSlug(name)
  }

  const insert = {
    tenant_id: tenantId,
    business_id: input.businessId ?? null,
    website_id: null,
    name,
    slug,
    event_type: eventType,
    event_date: eventDate,
    event_start_at: input.event_start_at ? new Date(input.event_start_at).toISOString() : null,
    event_end_at: input.event_end_at ? new Date(input.event_end_at).toISOString() : null,
    gallery_reveal_at: revealAt,
    timezone,
    is_active: input.is_active === undefined ? true : Boolean(input.is_active),
    allow_photos: input.allow_photos === undefined ? true : Boolean(input.allow_photos),
    allow_videos: input.allow_videos === undefined ? true : Boolean(input.allow_videos),
    allow_audio: input.allow_audio === undefined ? true : Boolean(input.allow_audio),
    video_max_seconds: Number(input.video_max_seconds ?? 15),
    audio_max_seconds: Number(input.audio_max_seconds ?? 30),
    require_pin: input.require_pin === undefined ? true : Boolean(input.require_pin),
    allow_guest_login: input.allow_guest_login === undefined ? true : Boolean(input.allow_guest_login),
    allow_guest_registration: input.allow_guest_registration === undefined ? true : Boolean(input.allow_guest_registration),
    gallery_locked_message: input.gallery_locked_message || defaults.gallery_locked_message,
    gallery_unlocked_message: input.gallery_unlocked_message || defaults.gallery_unlocked_message,
    theme: { theme_key: themeKey, ...(input.theme ?? {}) },
    settings: {
      headline: defaults.headline,
      subheadline: defaults.subheadline,
      upload_instructions: defaults.upload_instructions,
      upload_success_message: defaults.upload_success_message,
      ...(input.settings ?? {}),
    },
    created_by: input.createdBy ?? null,
  }

  const { data: event, error } = await db.from('pov_events').insert(insert).select('*').single()
  if (error) return { error: error.message }

  // Link the tenant's legacy site_settings to this event (backward-compat for
  // the POV admin/builder branch logic). The websites registry is the source of
  // truth for the multi-site list.
  const websiteType = input.websiteType === 'invitational' ? 'invitational' : 'pov_event'
  try {
    await getSupabaseServerClient()
      .from('site_settings')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({ tenant_id: tenantId, website_type: websiteType, pov_enabled: true, pov_event_id: event.id } as any,
        { onConflict: 'tenant_id' })
  } catch (e) {
    console.warn('[createPovEventRecord] site_settings link failed:', e instanceof Error ? e.message : e)
  }

  if (websiteType === 'invitational') {
    try {
      await ensureInvitationPages(tenantId, {
        eventName: event.name, eventDate: event.event_date, eventSlug: event.slug, povEnabled: true,
      })
    } catch { /* non-fatal */ }
  }

  // Register the event as its own separate website/app record.
  try { await ensureWebsiteRegistry(tenantId) } catch { /* non-fatal */ }

  return { event }
}
