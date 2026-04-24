// lib/customers/getTenantCustomerById.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { TenantCustomer } from './getTenantCustomers'

export interface TenantCustomerDetail extends TenantCustomer {
  account_email:  string | null
  account_status: string | null
  auth_user_id:   string | null
}

/**
 * Fetches a single customer by ID, strictly scoped to the provided tenant.
 * Returns null when the customer does not exist in that tenant (no cross-tenant reads).
 */
export async function getTenantCustomerById(
  tenantId:   string,
  customerId: string
): Promise<TenantCustomerDetail | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data, error } = await supabase
    .from('customers')
    .select(`
      id,
      tenant_id,
      name,
      display_name,
      email,
      phone,
      status,
      metadata,
      created_at,
      updated_at,
      customer_accounts (
        id,
        email,
        status,
        auth_user_id
      )
    `)
    .eq('id', customerId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (error) {
    console.error('[getTenantCustomerById]', error.message)
    return null
  }

  if (!data) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const acct = Array.isArray(data.customer_accounts) ? data.customer_accounts[0] as any : null

  return {
    id:             data.id,
    tenant_id:      data.tenant_id,
    name:           data.name,
    display_name:   data.display_name ?? null,
    email:          data.email ?? null,
    phone:          data.phone ?? null,
    status:         data.status ?? 'active',
    metadata:       data.metadata ?? {},
    created_at:     data.created_at,
    updated_at:     data.updated_at,
    has_account:    !!acct,
    account_email:  acct?.email ?? null,
    account_status: acct?.status ?? null,
    auth_user_id:   acct?.auth_user_id ?? null,
  }
}
