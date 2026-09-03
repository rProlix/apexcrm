export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { resolvePublicScrollExperienceBinding } from '@/lib/website-scroll-experience/public-binding'

const EVENTS = new Set([
  'scroll_experience_view',
  'scroll_experience_started',
  'scroll_experience_25',
  'scroll_experience_50',
  'scroll_experience_75',
  'scroll_experience_completed',
  'scroll_experience_cta_clicked',
])

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ experienceVersionId: string }> }
) {
  const { experienceVersionId } = await context.params
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const eventName = typeof body.eventName === 'string' ? body.eventName : ''
  const componentInstanceId =
    typeof body.componentInstanceId === 'string' ? body.componentInstanceId.slice(0, 160) : ''
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 160) : ''
  if (!EVENTS.has(eventName) || !componentInstanceId || !sessionId) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const db = getSupabaseServerClient() as SupabaseClient
  const binding = await resolvePublicScrollExperienceBinding(
    db,
    experienceVersionId,
    componentInstanceId
  )
  if (!binding) return NextResponse.json({ ok: false }, { status: 404 })
  const day = new Date().toISOString().slice(0, 10)
  const sessionHash = createHash('sha256')
    .update(`${day}:${experienceVersionId}:${sessionId}`)
    .digest('hex')
  const pagePath = typeof body.pagePath === 'string' ? body.pagePath.slice(0, 500) : null
  const { error } = await db.from('website_scroll_experience_events').insert({
    tenant_id: binding.tenant_id,
    experience_id: binding.experience_id,
    experience_version_id: experienceVersionId,
    component_instance_id: componentInstanceId,
    event_name: eventName,
    session_hash: sessionHash,
    page_path: pagePath,
  })
  if (error && error.code !== '23505') return NextResponse.json({ ok: false }, { status: 500 })
  return new NextResponse(null, { status: 204 })
}
