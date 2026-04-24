// lib/customers/findOrCreateTenantCustomer.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface FindOrCreateInput {
  tenantId:    string
  email?:      string | null
  phone?:      string | null
  name?:       string | null
  metadata?:   Record<string, unknown>
}

export interface FindOrCreateResult {
  customerId: string
  created:    boolean
}

/**
 * Finds an existing customer within the given tenant by email or phone,
 * or creates a new per-tenant customer record if none is found.
 *
 * Critically: the search is scoped to a single tenant_id, so the same
 * real-world person can exist as separate records across different tenants
 * without any cross-tenant linkage being visible.
 *
 * Also attempts to upsert a global customer_identity for the email/phone
 * (optional de-dup at platform level — not exposed to tenant admins).
 */
export async function findOrCreateTenantCustomer(
  input: FindOrCreateInput
): Promise<FindOrCreateResult> {
  const { tenantId, email, phone, name, metadata } = input
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any

  // 1. Try to find by email within this tenant
  if (email?.trim()) {
    const { data: byEmail } = await supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .ilike('email', email.trim())
      .maybeSingle()

    if (byEmail) return { customerId: byEmail.id, created: false }
  }

  // 2. Try to find by phone within this tenant
  if (phone?.trim()) {
    const { data: byPhone } = await supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('phone', phone.trim())
      .maybeSingle()

    if (byPhone) return { customerId: byPhone.id, created: false }
  }

  // 3. Optionally upsert a global identity (service-level, non-tenant-visible)
  let identityId: string | null = null
  if (email?.trim()) {
    const { data: identity } = await supabase
      .from('customer_identities')
      .upsert(
        { email: email.trim().toLowerCase(), name: name ?? null, phone: phone ?? null },
        { onConflict: 'email', ignoreDuplicates: false }
      )
      .select('id')
      .maybeSingle()
    identityId = identity?.id ?? null
  }

  // 4. Create a new tenant-scoped customer record
  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      tenant_id:            tenantId,
      name:                 name?.trim() || email?.split('@')[0] || 'New Customer',
      email:                email?.trim() ?? null,
      phone:                phone?.trim() ?? null,
      status:               'active',
      metadata:             metadata ?? {},
      customer_identity_id: identityId,
    })
    .select('id')
    .single()

  if (error || !newCustomer) {
    console.error('[findOrCreateTenantCustomer] insert error:', error?.message)
    throw new Error(error?.message ?? 'Failed to create customer')
  }

  return { customerId: newCustomer.id, created: true }
}
