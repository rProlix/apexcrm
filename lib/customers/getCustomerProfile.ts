// lib/customers/getCustomerProfile.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface CustomerProfile {
  id:               string
  tenant_id:        string
  customer_id:      string
  preferences:      Record<string, unknown>
  notes:            CustomerNote[]
  marketing_opt_in: boolean
  created_at:       string
  updated_at:       string
}

export interface CustomerNote {
  id:         string
  text:       string
  author:     string
  created_at: string
}

/**
 * Fetches the tenant-scoped profile for a customer.
 * Returns null if no profile exists yet (auto-creates on first update).
 * Strictly scoped to tenant_id + customer_id.
 */
export async function getCustomerProfile(
  tenantId:   string,
  customerId: string
): Promise<CustomerProfile | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  const { data, error } = await supabase
    .from('customer_profiles')
    .select('id, tenant_id, customer_id, preferences, notes, marketing_opt_in, created_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .maybeSingle()

  if (error) {
    console.error('[getCustomerProfile]', error.message)
    return null
  }

  if (!data) return null

  return {
    id:               data.id,
    tenant_id:        data.tenant_id,
    customer_id:      data.customer_id,
    preferences:      (data.preferences ?? {}) as Record<string, unknown>,
    notes:            Array.isArray(data.notes) ? (data.notes as CustomerNote[]) : [],
    marketing_opt_in: data.marketing_opt_in ?? false,
    created_at:       data.created_at,
    updated_at:       data.updated_at,
  }
}

/**
 * Ensures a customer_profiles row exists, creating it with defaults if absent.
 * Returns the existing or newly created profile.
 */
export async function ensureCustomerProfile(
  tenantId:   string,
  customerId: string
): Promise<CustomerProfile> {
  const existing = await getCustomerProfile(tenantId, customerId)
  if (existing) return existing

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const { data, error } = await supabase
    .from('customer_profiles')
    .insert({
      tenant_id:        tenantId,
      customer_id:      customerId,
      preferences:      {},
      notes:            [],
      marketing_opt_in: false,
    })
    .select('id, tenant_id, customer_id, preferences, notes, marketing_opt_in, created_at, updated_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to create customer profile')
  }

  return {
    ...data,
    preferences: data.preferences ?? {},
    notes:       Array.isArray(data.notes) ? data.notes : [],
  } as CustomerProfile
}
