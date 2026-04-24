// lib/customers/searchTenantCustomers.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { TenantCustomer } from './getTenantCustomers'

/**
 * Full-text search within a single tenant's customers.
 * Searches name, email, and phone fields.
 * Strictly scoped to tenant_id — never leaks across tenants.
 */
export async function searchTenantCustomers(
  tenantId: string,
  query:    string,
  limit:    number = 20
): Promise<TenantCustomer[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('customers')
    .select('id, tenant_id, name, display_name, email, phone, status, metadata, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .or(`name.ilike.%${trimmed}%,email.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`)
    .order('name')
    .limit(limit)

  if (error) {
    console.error('[searchTenantCustomers]', error.message)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    ...row,
    has_account: false,
  })) as TenantCustomer[]
}
