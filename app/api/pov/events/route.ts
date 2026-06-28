// app/api/pov/events/route.ts
// Admin/builder: list (GET) and create (POST) POV events for a tenant.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { povDb } from '@/lib/pov/db'
import { createPovEventRecord } from '@/lib/pov/createEvent'

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

  const result = await createPovEventRecord({
    tenantId,
    name: String(body.name ?? ''),
    websiteType: body.website_type === 'invitational' ? 'invitational' : 'pov_event',
    createdBy: ctx.id ?? null,
    businessId: (body.business_id as string | null) ?? null,
    event_type: body.event_type as string | undefined,
    event_date: typeof body.event_date === 'string' ? body.event_date : null,
    event_start_at: typeof body.event_start_at === 'string' ? body.event_start_at : null,
    event_end_at: typeof body.event_end_at === 'string' ? body.event_end_at : null,
    gallery_reveal_at: typeof body.gallery_reveal_at === 'string' ? body.gallery_reveal_at : null,
    timezone: typeof body.timezone === 'string' ? body.timezone : undefined,
    is_active: body.is_active as boolean | undefined,
    allow_photos: body.allow_photos as boolean | undefined,
    allow_videos: body.allow_videos as boolean | undefined,
    allow_audio: body.allow_audio as boolean | undefined,
    video_max_seconds: body.video_max_seconds as number | undefined,
    audio_max_seconds: body.audio_max_seconds as number | undefined,
    require_pin: body.require_pin as boolean | undefined,
    allow_guest_login: body.allow_guest_login as boolean | undefined,
    allow_guest_registration: body.allow_guest_registration as boolean | undefined,
    gallery_locked_message: body.gallery_locked_message as string | undefined,
    gallery_unlocked_message: body.gallery_unlocked_message as string | undefined,
    theme_key: body.theme_key as string | undefined,
    theme: body.theme as Record<string, unknown> | undefined,
    settings: body.settings as Record<string, unknown> | undefined,
  })

  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ event: result.event }, { status: 201 })
}
