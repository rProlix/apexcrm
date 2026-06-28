// app/api/website/invitation/init/route.ts
// Admin/builder: mark a site as Invitation/Event (without POV camera) and seed
// default invitation pages. Used by the "What are you building?" flow when the
// user picks Invitation/Event but leaves the POV Event Camera toggle off.

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ensureInvitationPages } from '@/lib/pov/invitationPages'
import { sanitizeTenantId } from '@/lib/website/resolveWebsiteTenant'

function forbidden() { return NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()

  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const hint = sanitizeTenantId(body.tenant_id)
  const self = sanitizeTenantId(ctx.tenant_id)
  const tenantId = ctx.role === 'owner' ? (hint ?? self) : (self && hint && self !== hint ? null : (self ?? hint))
  if (!tenantId) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = getSupabaseServerClient() as any
  const { error } = await db.from('site_settings').upsert({
    tenant_id:   tenantId,
    website_type: 'invitational',
    pov_enabled: false,
  }, { onConflict: 'tenant_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const created = await ensureInvitationPages(tenantId, {
    eventName: typeof body.event_name === 'string' ? body.event_name : null,
    eventDate: typeof body.event_date === 'string' ? body.event_date : null,
    povEnabled: false,
  })

  return NextResponse.json({ ok: true, pagesScaffolded: created })
}
