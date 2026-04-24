// lib/auth/customerGuard.ts
import { redirect } from 'next/navigation'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import type { CustomerContext } from './types'

/**
 * Server-side auth guard for the customer portal.
 *
 * Validates the session, looks up the customer_accounts row for the
 * current auth user and tenant, and returns the CustomerContext.
 *
 * Redirects to /login if:
 *  - No active session
 *  - No matching active customer_account for this tenant
 */
export async function requireCustomerAuth(host: string): Promise<CustomerContext> {
  const sessionClient = createSessionServerClient()
  const { data: { user }, error } = await sessionClient.auth.getUser()

  if (error || !user) {
    redirect('/login?next=/portal')
  }

  const tenant = await getTenantFromHost(host)
  if (!tenant) {
    redirect('/')
  }

  const admin = getSupabaseServerClient()
  const { data: account } = await admin
    .from('customer_accounts')
    .select('id, customer_id, email, status, role')
    .eq('auth_user_id', user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  if (!account || account.status !== 'active') {
    redirect('/login?error=unauthorized')
  }

  return {
    id:          account.id,
    auth_id:     user.id,
    tenant_id:   tenant.id,
    customer_id: account.customer_id,
    role:        'customer',
    email:       account.email,
  }
}

/**
 * Returns the CustomerContext without redirecting.
 * Returns null if unauthenticated or no portal account exists.
 */
export async function getCustomerContext(host: string): Promise<CustomerContext | null> {
  const sessionClient = createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  if (!user) return null

  const tenant = await getTenantFromHost(host)
  if (!tenant) return null

  const admin = getSupabaseServerClient()
  const { data: account } = await admin
    .from('customer_accounts')
    .select('id, customer_id, email, status, role')
    .eq('auth_user_id', user.id)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  if (!account || account.status !== 'active') return null

  return {
    id:          account.id,
    auth_id:     user.id,
    tenant_id:   tenant.id,
    customer_id: account.customer_id,
    role:        'customer',
    email:       account.email,
  }
}

/**
 * Asserts that a fetched record belongs to the authenticated customer.
 * Throws an error (HTTP 403 equivalent) if the customer_id does not match.
 *
 * Usage:
 *   const appt = await fetchAppointment(id)
 *   assertCustomerOwns(appt, ctx.customer_id)
 */
export function assertCustomerOwns(
  record: { customer_id?: string | null } | null | undefined,
  customerId: string
): void {
  if (!record || record.customer_id !== customerId) {
    throw new Error('Forbidden: this resource does not belong to the authenticated customer')
  }
}

/**
 * Convenience: build a query filter that scopes results to the current customer.
 * Returns an object you can spread into your Supabase `.match()` or `.eq()` calls.
 *
 * Example:
 *   const rows = await supabase
 *     .from('appointments')
 *     .select('*')
 *     .match(customerScope(ctx))
 */
export function customerScope(ctx: CustomerContext): {
  tenant_id:   string
  customer_id: string
} {
  return {
    tenant_id:   ctx.tenant_id,
    customer_id: ctx.customer_id,
  }
}
