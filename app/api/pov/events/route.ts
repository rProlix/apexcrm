// app/api/pov/events/route.ts
// Admin/builder: list (GET) and create (POST) POV events for a tenant.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { povDb } from '@/lib/pov/db'
import { generateEventSlug } from '@/lib/pov/crypto'
import { defaultRevealAt } from '@/lib/pov/events'
import { generatePovDefaults } from '@/lib/pov/aiDefaults'
import { ensureInvitationPages } from '@/lib/pov/invitationPages'
import { POV_EVENT_TYPES, type PovEventType } from '@/lib/pov/types'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

function resolveTenantId(role: string, ctxTenant: string | null, hint?: string | null): string | null {
  const self = ctxTenant && ctxTenant.trim() ? ctxTenant.trim() : null
  const h = hint && hint.trim() ? hint.trim() : null
  if (role === 'owner') return h ?? self
  if (self && h && self !== h) return null
  return self ?? h
}

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin', 'staff'].includes(ctx.role)) return forbidden()

  const tenantId = resolveTenantId(ctx.role, ctx.tenant_id, req.nextUrl.searchParams.get('tenant_id'))
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const { data, error } = await povDb()
    .from('pov_events')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ events: data ?? [] })
}

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const tenantId = resolveTenantId(ctx.role, ctx.tenant_id, body.tenant_id as string | undefined)
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Event name is required.' }, { status: 400 })

  const eventType = POV_EVENT_TYPES.includes(body.event_type as PovEventType)
    ? (body.event_type as PovEventType)
    : 'other'
  const timezone = String(body.timezone ?? 'America/Los_Angeles')
  const eventDate = typeof body.event_date === 'string' && body.event_date ? body.event_date : null

  const revealAt =
    typeof body.gallery_reveal_at === 'string' && body.gallery_reveal_at
      ? new Date(body.gallery_reveal_at).toISOString()
      : defaultRevealAt({ eventDate, timezone })

  const defaults = generatePovDefaults(eventType)
  const themeKey = typeof body.theme_key === 'string' ? body.theme_key : defaults.theme_key

  const db = povDb()

  // Generate a unique slug (retry a couple times on the rare collision).
  let slug = generateEventSlug(name)
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: clash } = await db
      .from('pov_events')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('slug', slug)
      .maybeSingle()
    if (!clash) break
    slug = generateEventSlug(name)
  }

  const insert = {
    tenant_id:                tenantId,
    business_id:              (body.business_id as string | null) ?? null,
    website_id:               (body.website_id as string | null) ?? null,
    name,
    slug,
    event_type:               eventType,
    event_date:               eventDate,
    event_start_at:           typeof body.event_start_at === 'string' && body.event_start_at
      ? new Date(body.event_start_at).toISOString() : null,
    event_end_at:             typeof body.event_end_at === 'string' && body.event_end_at
      ? new Date(body.event_end_at).toISOString() : null,
    gallery_reveal_at:        revealAt,
    timezone,
    is_active:                body.is_active === undefined ? true : Boolean(body.is_active),
    allow_photos:             body.allow_photos === undefined ? true : Boolean(body.allow_photos),
    allow_videos:             body.allow_videos === undefined ? true : Boolean(body.allow_videos),
    allow_audio:              body.allow_audio === undefined ? true : Boolean(body.allow_audio),
    video_max_seconds:        Number(body.video_max_seconds ?? 15),
    audio_max_seconds:        Number(body.audio_max_seconds ?? 30),
    require_pin:              body.require_pin === undefined ? true : Boolean(body.require_pin),
    allow_guest_login:        body.allow_guest_login === undefined ? true : Boolean(body.allow_guest_login),
    allow_guest_registration: body.allow_guest_registration === undefined ? true : Boolean(body.allow_guest_registration),
    gallery_locked_message:   String(body.gallery_locked_message ?? defaults.gallery_locked_message),
    gallery_unlocked_message: String(body.gallery_unlocked_message ?? defaults.gallery_unlocked_message),
    theme:                    { theme_key: themeKey, ...(body.theme as object ?? {}) },
    settings:                 {
      headline:            defaults.headline,
      subheadline:         defaults.subheadline,
      upload_instructions: defaults.upload_instructions,
      upload_success_message: defaults.upload_success_message,
      ...(body.settings as object ?? {}),
    },
    created_by:               ctx.id ?? null,
  }

  const { data: event, error } = await db
    .from('pov_events')
    .insert(insert)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Link the tenant's site to this event. A standalone POV Event App sets
  // website_type='pov_event'; an Invitation/Event site keeps 'invitational'
  // and just turns POV on. Either way pov_enabled + pov_event_id are set.
  const websiteType = body.website_type === 'invitational' ? 'invitational' : 'pov_event'
  try {
    await getSupabaseServerClient()
      .from('site_settings')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert({
        tenant_id:    tenantId,
        website_type: websiteType,
        pov_enabled:  true,
        pov_event_id: event.id,
      } as any, { onConflict: 'tenant_id' })
  } catch (e) {
    console.warn('[pov:create] could not link site_settings:', e instanceof Error ? e.message : e)
  }

  // For Invitation/Event sites, seed default invitation pages (home/details/
  // schedule) that link to the event camera. Best-effort, only if no pages yet.
  if (websiteType === 'invitational') {
    try {
      await ensureInvitationPages(tenantId, {
        eventName: event.name, eventDate: event.event_date,
        eventSlug: event.slug, povEnabled: true,
      })
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ event }, { status: 201 })
}
