// lib/customers/getTenantCustomers.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface TenantCustomer {
  id:           string
  tenant_id:    string
  name:         string
  display_name: string | null
  email:        string | null
  phone:        string | null
  status:       string
  metadata:     Record<string, unknown>
  created_at:   string
  updated_at:   string
  /** Denormalised from customer_accounts join */
  has_account:  boolean
}

export interface GetTenantCustomersOptions {
  limit?:   number
  offset?:  number
  status?:  string
  search?:  string
}

/**
 * Returns all customers belonging to a single tenant.
 * Never crosses tenant boundaries — always filters by tenant_id.
 */
export async function getTenantCustomers(
  tenantId: string,
  options:  GetTenantCustomersOptions = {}
): Promise<TenantCustomer[]> {
  const supabase = getSupabaseServerClient()
  const { limit = 50, offset = 0, status, search } = options

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
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
      customer_accounts!inner ( id )
    `, { count: 'exact' })
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status) query = query.eq('status', status)

  if (search?.trim()) {
    const s = search.trim()
    query = query.or(
      `name.ilike.%${s}%,email.ilike.%${s}%,phone.ilike.%${s}%`
    )
  }

  const { data, error } = await query

  if (error) {
    console.error('[getTenantCustomers]', error.message)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    ...row,
    has_account: Array.isArray(row.customer_accounts) && row.customer_accounts.length > 0,
    customer_accounts: undefined,
  })) as TenantCustomer[]
}

export async function countTenantCustomers(
  tenantId: string,
  status?:  string
): Promise<number> {
  const supabase = getSupabaseServerClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)

  if (status) query = query.eq('status', status)

  const { count } = await query
  return count ?? 0
}
