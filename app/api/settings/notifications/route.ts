// app/api/settings/notifications/route.ts
// GET/PATCH notification preferences stored in tenant branding JSONB.
import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'

function forbidden() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

export async function GET() {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const db = getSupabaseServerClient()
  const { data, error } = await db
    .from('tenants')
    .select('branding')
    .eq('id', ctx.tenant_id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const branding = (data?.branding ?? {}) as Record<string, unknown>
  const notifications = (branding.notifications ?? {
    email_new_order:       true,
    email_new_lead:        true,
    email_new_customer:    false,
    email_appointment:     true,
    email_payment:         true,
    email_weekly_digest:   true,
    webhook_url:           null,
    webhook_new_order:     false,
    webhook_new_lead:      false,
  }) as Record<string, unknown>

  return NextResponse.json({ notifications })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx || !['owner', 'admin'].includes(ctx.role)) return forbidden()
  if (!ctx.tenant_id) return NextResponse.json({ error: 'No tenant' }, { status: 400 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  const db = getSupabaseServerClient()
  const { data: current } = await db
    .from('tenants')
    .select('branding')
    .eq('id', ctx.tenant_id)
    .single()

  const branding = (current?.branding ?? {}) as Record<string, unknown>
  const existingNotifications = (branding.notifications ?? {}) as Record<string, unknown>

  const allowedKeys = [
    'email_new_order', 'email_new_lead', 'email_new_customer',
    'email_appointment', 'email_payment', 'email_weekly_digest',
    'webhook_url', 'webhook_new_order', 'webhook_new_lead',
  ]
  const patch: Record<string, unknown> = {}
  for (const key of allowedKeys) {
    if (key in body) patch[key] = body[key]
  }

  const updatedBranding = {
    ...branding,
    notifications: { ...existingNotifications, ...patch },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from('tenants') as any)
    .update({ branding: updatedBranding, updated_at: new Date().toISOString() })
    .eq('id', ctx.tenant_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, notifications: updatedBranding.notifications })
}
