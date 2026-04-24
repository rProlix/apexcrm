// lib/customers/linkCustomerAccount.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface LinkCustomerAccountInput {
  tenantId:   string
  customerId: string
  authUserId: string
  email:      string
}

/**
 * Links an authenticated Supabase auth user to a tenant-scoped customer record
 * via the customer_accounts table.
 *
 * - If an account already exists for this authUserId+tenantId, returns the
 *   existing account ID (idempotent).
 * - Scoped strictly to tenant_id to prevent cross-tenant account merging.
 */
export async function linkCustomerAccount(
  input: LinkCustomerAccountInput
): Promise<{ accountId: string; created: boolean }> {
  const { tenantId, customerId, authUserId, email } = input
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // Check for existing account for this auth user in this tenant
  const { data: existing } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', authUserId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existing) return { accountId: existing.id, created: false }

  const { data: account, error } = await supabase
    .from('customer_accounts')
    .insert({
      tenant_id:   tenantId,
      customer_id: customerId,
      auth_user_id: authUserId,
      email,
      status: 'active',
      role:   'customer',
    })
    .select('id')
    .single()

  if (error || !account) {
    console.error('[linkCustomerAccount] insert error:', error?.message)
    throw new Error(error?.message ?? 'Failed to link customer account')
  }

  return { accountId: account.id, created: true }
}

/**
 * Unlinks an auth account from a tenant customer record.
 * Strictly scoped by tenant_id.
 */
export async function unlinkCustomerAccount(
  tenantId:  string,
  accountId: string
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  await supabase
    .from('customer_accounts')
    .delete()
    .eq('id', accountId)
    .eq('tenant_id', tenantId)
}
