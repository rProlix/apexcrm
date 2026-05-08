// app/api/customer-invites/validate/route.ts
// POST /api/customer-invites/validate — validate a raw invite token (public endpoint)

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/invites/inviteHelpers'

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, error: message }, { status })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('INVALID_JSON', 'Request body must be valid JSON.', 400)
  }

  const token = typeof body.token === 'string' ? body.token.trim() : ''
  if (!token) return err('MISSING_TOKEN', 'Token is required.', 400)

  const tokenHash = hashToken(token)
  const supabase  = getSupabaseServerClient()

  // Use service role — customers cannot query invites via RLS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite } = await (supabase as any)
    .from('customer_invites')
    .select('id, tenant_id, customer_id, email, full_name, phone, status, expires_at, role')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (!invite) return err('INVITE_NOT_FOUND', 'This invite link is invalid or has already been used.', 404)

  if (invite.status === 'revoked')  return err('INVITE_REVOKED',  'This invite has been revoked.', 410)
  if (invite.status === 'accepted') return err('INVITE_ACCEPTED', 'This invite has already been accepted.', 409)
  if (invite.status === 'expired')  return err('INVITE_EXPIRED',  'This invite has expired. Please ask the business to send a new one.', 410)

  // Check expiry in real-time (status may still be 'pending' if not swept by a cron)
  if (new Date(invite.expires_at) < new Date()) {
    // Lazily mark as expired
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('customer_invites')
      .update({ status: 'expired' })
      .eq('id', invite.id)

    return err('INVITE_EXPIRED', 'This invite has expired. Please ask the business to send a new one.', 410)
  }

  // Load tenant public info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (supabase as any)
    .from('tenants')
    .select('id, name, subdomain, custom_domain, branding')
    .eq('id', invite.tenant_id)
    .maybeSingle()

  if (!tenant) return err('TENANT_NOT_FOUND', 'The business associated with this invite no longer exists.', 404)

  // Load enabled modules for this tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: modules } = await (supabase as any)
    .from('tenant_modules')
    .select('module_key, enabled')
    .eq('tenant_id', invite.tenant_id)

  const modMap = new Map<string, boolean>(
    (modules ?? []).map((m: { module_key: string; enabled: boolean }) => [m.module_key, m.enabled])
  )

  return NextResponse.json({
    ok: true,
    invite: {
      id:          invite.id,
      email:       invite.email,
      fullName:    invite.full_name,
      phone:       invite.phone,
      tenantId:    invite.tenant_id,
      tenantName:  tenant.name,
      tenantLogo:  (tenant.branding as Record<string, string>)?.logo_url ?? null,
      customerId:  invite.customer_id,
      expiresAt:   invite.expires_at,
      enabledModules: {
        appointments: modMap.get('appointments') ?? true,
        orders:       modMap.get('store') ?? false,
        rewards:      modMap.get('rewards') ?? false,
        payments:     modMap.get('payments') ?? false,
        store:        modMap.get('store') ?? false,
      },
    },
  })
}
