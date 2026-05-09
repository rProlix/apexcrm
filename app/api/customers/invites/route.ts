// app/api/customers/invites/route.ts
// POST /api/customers/invites  — send a customer invite
// GET  /api/customers/invites  — list invites for the current tenant

export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { generateInviteToken, buildInviteUrl, expiresInDays } from '@/lib/invites/inviteHelpers'
import { sendEmail } from '@/lib/email/sendEmail'
import { buildCustomerInviteEmail } from '@/lib/email/templates/customerInvite'
// Note: sendEmail now accepts EmailPayload with required `category` field

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, error: message }, { status })
}

// ─── POST /api/customers/invites ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (!hasPermission(ctx.role, 'manage_customers')) {
    return err('FORBIDDEN', 'You do not have permission to invite customers.', 403)
  }

  const tenantId = ctx.tenant_id
  if (!tenantId) return err('TENANT_NOT_FOUND', 'No tenant associated with your account.', 400)

  let body: Record<string, unknown>
  try { body = await req.json() } catch {
    return err('INVALID_JSON', 'Request body must be valid JSON.', 400)
  }

  const email         = typeof body.email      === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName      = typeof body.fullName   === 'string' ? body.fullName.trim() : null
  const phone         = typeof body.phone      === 'string' ? body.phone.trim() : null
  const customerId    = typeof body.customerId === 'string' ? body.customerId : null
  const expiresIn     = typeof body.expiresInDays === 'number' ? Math.min(Math.max(body.expiresInDays, 1), 30) : 7
  const shouldSendEmail = body.sendEmail !== false

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return err('INVALID_EMAIL', 'A valid email address is required.', 400)
  }

  const supabase = getSupabaseServerClient()

  // Load tenant for branding + domain info
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: tenant } = await (supabase as any)
    .from('tenants')
    .select('id, name, subdomain, custom_domain, branding')
    .eq('id', tenantId)
    .single()

  if (!tenant) return err('TENANT_NOT_FOUND', 'Tenant not found.', 404)

  // Resolve or validate the customer row
  let resolvedCustomerId: string | null = customerId

  if (customerId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingCustomer } = await (supabase as any)
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!existingCustomer) {
      return err('CUSTOMER_NOT_FOUND', 'Customer not found in this tenant.', 404)
    }
  } else {
    // Find or create customer by email
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingCustomer } = await (supabase as any)
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('email', email)
      .maybeSingle()

    if (existingCustomer) {
      resolvedCustomerId = existingCustomer.id
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newCustomer, error: createError } = await (supabase as any)
        .from('customers')
        .insert({
          tenant_id: tenantId,
          name:      fullName ?? email,
          email,
          phone:     phone ?? null,
        })
        .select('id')
        .single()

      if (createError || !newCustomer) {
        console.error('[POST /api/customers/invites] create customer:', createError?.message)
        return err('SERVER_ERROR', 'Failed to create customer record.', 500)
      }
      resolvedCustomerId = newCustomer.id
    }
  }

  // Check for existing pending invite for this tenant/email
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existingInvite } = await (supabase as any)
    .from('customer_invites')
    .select('id, status, expires_at, token_hash, resend_count')
    .eq('tenant_id', tenantId)
    .eq('email', email)
    .eq('status', 'pending')
    .maybeSingle()

  const now     = new Date()
  const expires = expiresInDays(expiresIn)
  const { token, tokenHash } = generateInviteToken()
  const inviteUrl = buildInviteUrl({
    token,
    subdomain:    tenant.subdomain,
    customDomain: tenant.custom_domain,
  })

  let inviteId: string

  if (existingInvite) {
    // Reuse existing pending invite — generate a fresh token and extend expiry
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error: updateError } = await (supabase as any)
      .from('customer_invites')
      .update({
        token_hash:    tokenHash,
        invite_url:    inviteUrl,
        expires_at:    expires.toISOString(),
        last_sent_at:  now.toISOString(),
        resend_count:  (existingInvite.resend_count ?? 0) + 1,
        full_name:     fullName ?? undefined,
        phone:         phone ?? undefined,
        customer_id:   resolvedCustomerId,
        invited_by:    ctx.auth_id,
      })
      .eq('id', existingInvite.id)
      .select('id, email, status, expires_at')
      .single()

    if (updateError || !updated) {
      console.error('[POST /api/customers/invites] update invite:', updateError?.message)
      return err('SERVER_ERROR', 'Failed to update invite.', 500)
    }

    inviteId = existingInvite.id
  } else {
    // Create new invite
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newInvite, error: insertError } = await (supabase as any)
      .from('customer_invites')
      .insert({
        tenant_id:    tenantId,
        customer_id:  resolvedCustomerId,
        email,
        full_name:    fullName,
        phone,
        invited_by:   ctx.auth_id,
        role:         'customer',
        status:       'pending',
        token_hash:   tokenHash,
        invite_url:   inviteUrl,
        expires_at:   expires.toISOString(),
        last_sent_at: now.toISOString(),
      })
      .select('id')
      .single()

    if (insertError || !newInvite) {
      console.error('[POST /api/customers/invites] insert invite:', insertError?.message)
      return err('SERVER_ERROR', 'Failed to create invite.', 500)
    }

    inviteId = newInvite.id
  }

  // Send email
  let emailResult = { ok: true, code: undefined as string | undefined }

  if (shouldSendEmail) {
    // Load enabled modules for the tenant to populate email features list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: modules } = await (supabase as any)
      .from('tenant_modules')
      .select('module_key, enabled')
      .eq('tenant_id', tenantId)

    const modMap = new Map<string, boolean>(
      (modules ?? []).map((m: { module_key: string; enabled: boolean }) => [m.module_key, m.enabled])
    )

    const branding = tenant.branding as Record<string, string> | null | undefined
    const tpl = buildCustomerInviteEmail({
      businessName:    tenant.name,
      businessLogoUrl: branding?.logo_url ?? null,
      businessWebsite: tenant.custom_domain
        ? `https://${tenant.custom_domain}`
        : tenant.subdomain
          ? `https://${tenant.subdomain}.${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? 'nexoranow.com'}`
          : null,
      primaryColor:    branding?.primary_color ?? null,
      customerName:    fullName ?? undefined,
      inviteUrl,
      expiresAt:       expires,
      enabledModules: {
        appointments: modMap.get('appointments') ?? true,
        orders:       modMap.get('store') ?? false,
        rewards:      modMap.get('rewards') ?? false,
        payments:     modMap.get('payments') ?? false,
      },
    })

    const result = await sendEmail({
      to:        email,
      subject:   tpl.subject,
      html:      tpl.html,
      text:      tpl.text,
      category:  'invite',
      tenantId,
      fromName:  tenant.name,   // white-label: business name as From display name
      metadata:  { inviteId, customerId: resolvedCustomerId },
    })

    // Preserve the real error message so the UI can show it — do NOT replace with a code
    emailResult = { ok: result.success, code: result.success ? undefined : (result.error ?? 'Email send failed') }

    if (!result.success) {
      console.error('[POST /api/customers/invites] email failed:', result.error)
    }
  }

  return NextResponse.json({
    ok: true,
    invite: {
      id:        inviteId,
      email,
      status:    'pending',
      expiresAt: expires.toISOString(),
      inviteUrl,
    },
    emailSent: emailResult.ok,
    emailError: !emailResult.ok ? emailResult.code : undefined,
  }, { status: 201 })
}

// ─── GET /api/customers/invites ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const ctx = await getUserContext()
  if (!ctx) return err('UNAUTHORIZED', 'Authentication required.', 401)
  if (!hasPermission(ctx.role, 'view_customers')) {
    return err('FORBIDDEN', 'You do not have permission to view invites.', 403)
  }

  const tenantId = ctx.tenant_id
  if (!tenantId) return err('TENANT_NOT_FOUND', 'No tenant associated with your account.', 400)

  const params     = req.nextUrl.searchParams
  const status     = params.get('status') ?? undefined
  const emailFilter = params.get('email') ?? undefined
  const customerIdFilter = params.get('customerId') ?? undefined

  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('customer_invites')
    .select('id, email, full_name, phone, status, expires_at, accepted_at, revoked_at, last_sent_at, resend_count, created_at, customer_id, invited_by, invite_url')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })

  if (status)           query = query.eq('status', status)
  if (emailFilter)      query = query.ilike('email', `%${emailFilter}%`)
  if (customerIdFilter) query = query.eq('customer_id', customerIdFilter)

  const { data, error } = await query

  if (error) {
    console.error('[GET /api/customers/invites]', error.message)
    return err('SERVER_ERROR', 'Failed to load invites.', 500)
  }

  return NextResponse.json({ ok: true, invites: data ?? [] })
}
