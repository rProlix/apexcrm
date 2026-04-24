// lib/customers/updateCustomerProfile.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { ensureCustomerProfile, type CustomerProfile } from './getCustomerProfile'

export interface UpdateProfileInput {
  preferences?:      Record<string, unknown>
  marketing_opt_in?: boolean
}

export interface AddNoteInput {
  tenantId:   string
  customerId: string
  text:       string
  author:     string
}

/**
 * Updates the customer's tenant-scoped profile.
 * Creates the profile row if it doesn't exist yet (upsert semantics).
 * Strictly scoped to tenant_id + customer_id — cannot update other tenants.
 */
export async function updateCustomerProfile(
  tenantId:    string,
  customerId:  string,
  updates:     UpdateProfileInput
): Promise<CustomerProfile> {
  await ensureCustomerProfile(tenantId, customerId)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const { data, error } = await supabase
    .from('customer_profiles')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .select('id, tenant_id, customer_id, preferences, notes, marketing_opt_in, created_at, updated_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to update customer profile')
  }

  return {
    ...data,
    preferences: data.preferences ?? {},
    notes:       Array.isArray(data.notes) ? data.notes : [],
  } as CustomerProfile
}

/**
 * Appends a note to the customer's profile notes array.
 * Notes are stored as a JSON array; each entry has id, text, author, created_at.
 * Strictly scoped to tenant_id + customer_id.
 */
export async function addCustomerNote(input: AddNoteInput): Promise<CustomerProfile> {
  const { tenantId, customerId, text, author } = input
  const profile = await ensureCustomerProfile(tenantId, customerId)

  const newNote = {
    id:         crypto.randomUUID(),
    text:       text.trim(),
    author,
    created_at: new Date().toISOString(),
  }

  const updatedNotes = [...profile.notes, newNote]

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const { data, error } = await supabase
    .from('customer_profiles')
    .update({ notes: updatedNotes, updated_at: new Date().toISOString() })
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId)
    .select('id, tenant_id, customer_id, preferences, notes, marketing_opt_in, created_at, updated_at')
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to add note')
  }

  return {
    ...data,
    preferences: data.preferences ?? {},
    notes:       Array.isArray(data.notes) ? data.notes : [],
  } as CustomerProfile
}

/**
 * Updates the customer's core record (name, email, phone, status).
 * Strictly scoped to tenant_id.
 */
export async function updateTenantCustomer(
  tenantId:   string,
  customerId: string,
  updates: {
    name?:         string
    email?:        string | null
    phone?:        string | null
    display_name?: string | null
    status?:       string
    metadata?:     Record<string, unknown>
  }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const { error } = await supabase
    .from('customers')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', customerId)
    .eq('tenant_id', tenantId)

  if (error) throw new Error(error.message)
}
