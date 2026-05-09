// app/api/customers/invites/[id]/resend/route.ts
// POST /api/customers/invites/[id]/resend — resend an invite email

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { generateInviteToken, buildInviteUrl, expiresInDays } from '@/lib/invites/inviteHelpers'
import { sendEmail } from '@/lib/email/sendEmail'
import { buildCustomerInviteEmail } from '@/lib/email/templates/customerInvite'

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, error: message }, { status })
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const ctx = await getUserContext()
  if (!ctx) return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (!hasPermission(ctx.role, 'manage_customers')) {
    return err('FORBIDDEN', 'You do not have permission to resend invites.', 403)
  }

  const tenantId = ctx.tenant_id
  if (!tenantId) return err('TENANT_NOT_FOUND', 'No tenant associated with your account.', 400)

  const supabase = getSupabaseServerClient()

  // Load invite — strictly scoped to tenant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: invite } = await (supabase as any)
    .from('customer_invites')
    .select('id, email, full_name, status, expires_at, resend_count, customer_id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (!invite) return err('INVITE_NOT_FOUND', 'Invite not found.', 404)

  if (invite.status === 'accepted') return err('INVITE_ACCEPTED', 'This invite has already been accepted.', 409)
  if (invite.status === 'revoked')  return err('INVITE_REVOKED',  'This invite has been revoked.', 409)

  // Load tenant for branding + domain
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (supabase as any)
    .from('tenants')
    .select('id, name, subdomain, custom_domain, branding')
    .eq('id', tenantId)
    .single()

  if (!tenant) return err('TENANT_NOT_FOUND', 'Tenant not found.', 404)

  // Generate fresh token (expired or still valid — always refresh for security)
  const { token, tokenHash } = generateInviteToken()
  const expires = expiresInDays(7) // standard 7-day window on resend
  const now     = new Date()
  const inviteUrl = buildInviteUrl({
    token,
    subdomain:    tenant.subdomain,
    customDomain: tenant.custom_domain,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: updateError } = await (supabase as any)
    .from('customer_invites')
    .update({
      token_hash:   tokenHash,
      invite_url:   inviteUrl,
      expires_at:   expires.toISOString(),
      status:       'pending',
      last_sent_at: now.toISOString(),
      resend_count: (invite.resend_count ?? 0) + 1,
    })
    .eq('id', id)

  if (updateError) {
    console.error('[POST /api/customers/invites/[id]/resend]', updateError.message)
    return err('SERVER_ERROR', 'Failed to update invite.', 500)
  }

  // Load modules for email features list
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: modules } = await (supabase as any)
    .from('tenant_modules')
    .select('module_key, enabled')
    .eq('tenant_id', tenantId)

  const modMap = new Map<string, boolean>(
    (modules ?? []).map((m: { module_key: string; enabled: boolean }) => [m.module_key, m.enabled])
  )

  const tpl = buildCustomerInviteEmail({
    businessName:    tenant.name,
    businessLogoUrl: (tenant.branding as Record<string, string>)?.logo_url ?? undefined,
    customerName:    invite.full_name ?? undefined,
    inviteUrl,
    expiresAt:       expires,
    enabledModules: {
      appointments: modMap.get('appointments') ?? true,
      orders:       modMap.get('store') ?? false,
      rewards:      modMap.get('rewards') ?? false,
      payments:     modMap.get('payments') ?? false,
    },
  })

  const emailResult = await sendEmail({
    to:       invite.email,
    subject:  tpl.subject,
    html:     tpl.html,
    text:     tpl.text,
    category: 'invite',
    tenantId,
    metadata: { inviteId: id, customerId: invite.customer_id },
  })

  return NextResponse.json({
    ok:        true,
    emailSent: emailResult.success,
    emailError: !emailResult.success ? (emailResult.error ?? 'EMAIL_SEND_FAILED') : undefined,
    invite: {
      id,
      email:     invite.email,
      status:    'pending',
      expiresAt: expires.toISOString(),
      inviteUrl,
    },
  })
}
