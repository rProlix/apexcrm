// app/api/customers/link/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { findOrCreateTenantCustomer } from '@/lib/customers/findOrCreateTenantCustomer'
import { linkCustomerAccount } from '@/lib/customers/linkCustomerAccount'

// ─── POST /api/customers/link ─────────────────────────────────────────────────
// Called when a customer logs in or registers on the portal.
// Links their auth session to a tenant_customer record (creates one if needed).
//
// Body: { name?: string }
// The email is taken from the authenticated auth.users session — never trusted from body.
export async function POST(req: NextRequest) {
  const session = createSessionServerClient()
  const { data: { user }, error: authErr } = await session.auth.getUser()

  if (authErr || !user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const host   = req.headers.get('host') ?? ''
  const tenant = await getTenantFromHost(host)
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 400 })
  }

  let body: { name?: string } = {}
  try { body = await req.json() } catch { /* name is optional */ }

  const { customerId, created: customerCreated } = await findOrCreateTenantCustomer({
    tenantId: tenant.id,
    email:    user.email,
    name:     body.name?.trim() ?? null,
  })

  const { accountId, created: accountCreated } = await linkCustomerAccount({
    tenantId:   tenant.id,
    customerId,
    authUserId: user.id,
    email:      user.email,
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const { data: customer } = await supabase
    .from('customers')
    .select('id, name, email, phone, status')
    .eq('id', customerId)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  return NextResponse.json({
    customer,
    account_id:       accountId,
    customer_created: customerCreated,
    account_created:  accountCreated,
  }, { status: 200 })
}
