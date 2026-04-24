// lib/customers/resolveCustomerIdentity.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Looks up or creates the global customer_identity for an email address.
 *
 * IMPORTANT: This function is for platform-level identity resolution ONLY.
 * It NEVER exposes cross-tenant customer data.  Callers must never return
 * the identity ID or linked records to tenant admins or customers.
 *
 * Used internally by findOrCreateTenantCustomer to maintain a global
 * de-duplication layer at the platform level.
 */
export async function resolveCustomerIdentity(
  email: string,
  opts?: { name?: string | null; phone?: string | null }
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = getSupabaseServerClient() as any
  const normalised = email.trim().toLowerCase()

  // Try to find existing identity
  const { data: existing } = await supabase
    .from('customer_identities')
    .select('id')
    .eq('email', normalised)
    .maybeSingle()

  if (existing) return existing.id as string

  // Create a new identity record
  const { data: created, error } = await supabase
    .from('customer_identities')
    .insert({
      email: normalised,
      name:  opts?.name  ?? null,
      phone: opts?.phone ?? null,
    })
    .select('id')
    .single()

  if (error || !created) {
    // If unique constraint race — try fetching again
    const { data: refetch } = await supabase
      .from('customer_identities')
      .select('id')
      .eq('email', normalised)
      .maybeSingle()

    if (refetch) return refetch.id as string
    throw new Error(error?.message ?? 'Failed to resolve customer identity')
  }

  return created.id as string
}
