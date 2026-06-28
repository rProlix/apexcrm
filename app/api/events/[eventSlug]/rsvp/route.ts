// app/api/events/[eventSlug]/rsvp/route.ts
// Public RSVP submission for Canva PDF / config-backed event websites.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolvePublicEventWebsite } from '@/lib/website/canva/eventWebsite'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

export async function POST(req: NextRequest, ctx: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await ctx.params
  const site = await resolvePublicEventWebsite(eventSlug)
  if (!site) return NextResponse.json({ ok: false, error: 'Event not found.' }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ ok: false, error: 'Name is required.' }, { status: 400 })

  const db = getSupabaseServerClient() as DB
  const { error } = await db.from('event_rsvps').insert({
    tenant_id: site.tenant_id,
    website_id: site.id,
    pov_event_id: site.pov_event_id ?? null,
    name,
    email: body.email ? String(body.email).trim() : null,
    phone: body.phone ? String(body.phone).trim() : null,
    attending: typeof body.attending === 'boolean' ? body.attending : null,
    guest_count: Math.max(1, Number(body.guest_count) || 1),
    message: body.message ? String(body.message).trim() : null,
    metadata: { source: 'canva_pdf_rsvp', eventSlug },
  })

  if (error) return NextResponse.json({ ok: false, error: `Could not save RSVP: ${error.message}` }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ eventSlug: string }> }) {
  const { eventSlug } = await ctx.params
  const userCtx = await (await import('@/lib/auth/getUserContext')).getUserContext()
  if (!userCtx || !['owner', 'admin'].includes(userCtx.role)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const site = await resolvePublicEventWebsite(eventSlug)
  if (!site) return NextResponse.json({ ok: false, error: 'Event not found.' }, { status: 404 })
  if (userCtx.role !== 'owner' && userCtx.tenant_id !== site.tenant_id) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  const db = getSupabaseServerClient() as DB
  const { data, error } = await db.from('event_rsvps')
    .select('id,name,email,phone,attending,guest_count,message,created_at')
    .eq('website_id', site.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, count: data?.length ?? 0, submissions: data ?? [] })
}
