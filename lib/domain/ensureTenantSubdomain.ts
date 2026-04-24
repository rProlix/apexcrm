// lib/domain/ensureTenantSubdomain.ts
// Idempotently creates the platform subdomain domain record for a tenant.
// Called during tenant creation and as a repair utility.

import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Ensures a verified platform subdomain entry exists in tenant_domains for
 * the given tenant.  Safe to call multiple times — uses ON CONFLICT DO NOTHING.
 *
 * Returns the id of the subdomain row (existing or newly created).
 */
export async function ensureTenantSubdomain(
  tenantId: string,
  slug:     string,
): Promise<string | null> {
  const db = getSupabaseServerClient() as any

  // Check if it already exists
  const { data: existing } = await db
    .from('tenant_domains')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('domain_type', 'subdomain')
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: inserted, error } = await db
    .from('tenant_domains')
    .insert({
      tenant_id:           tenantId,
      hostname:            slug,
      domain_type:         'subdomain',
      is_primary:          true,
      is_verified:         true,
      verified:            true,
      ssl_status:          'active',
      verification_method: null,
      verification_token:  null,
      metadata:            {},
    })
    .select('id')
    .maybeSingle()

  if (error) {
    // Could be a unique-hostname conflict from a concurrent call; treat as success
    if (error.code === '23505') {
      const { data: refetched } = await db
        .from('tenant_domains')
        .select('id')
        .eq('hostname', slug)
        .maybeSingle()
      return refetched?.id ?? null
    }
    console.error('[ensureTenantSubdomain] error:', error.message)
    return null
  }

  return inserted?.id ?? null
}

/**
 * Ensures that site_settings contains a row with the correct subdomain value.
 */
export async function ensureSiteSettings(
  tenantId: string,
  slug:     string,
): Promise<void> {
  const db = getSupabaseServerClient() as any

  const { data: existing } = await db
    .from('site_settings')
    .select('id')
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existing) {
    await db
      .from('site_settings')
      .update({ subdomain: slug })
      .eq('tenant_id', tenantId)
      .is('subdomain', null)
    return
  }

  await db
    .from('site_settings')
    .insert({
      tenant_id:   tenantId,
      subdomain:   slug,
      domain_type: 'subdomain',
      domain_mode: 'subdomain',
      is_published: false,
    })
}
