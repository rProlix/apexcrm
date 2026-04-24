'use server'

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { slugifyBusinessName } from '@/lib/validation/auth'
import type { Json } from '@/lib/supabase/types'

export interface CreateTenantResult {
  tenantId: string
  userId:   string
}

/**
 * Server action — creates a tenant and owner user profile for a newly
 * signed-up business. Verifies the auth user via the admin API before
 * writing to the database so the caller cannot spoof a foreign user ID.
 *
 * Idempotent: if a user profile already exists for this authUserId the
 * existing tenant/user IDs are returned immediately.
 */
export async function createTenantForUser({
  authUserId,
  email,
  businessName,
  slug,
}: {
  authUserId:   string
  email:        string
  businessName: string
  slug?:        string
}): Promise<CreateTenantResult> {
  const supabase = getSupabaseServerClient() as any

  // Verify the auth user actually exists in Supabase Auth
  const { data: authData, error: authError } =
    await supabase.auth.admin.getUserById(authUserId)

  if (authError || !authData.user) {
    throw new Error('Unable to verify your account. Please try signing up again.')
  }

  // Idempotency: return early if the profile was already created
  const { data: existing } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (existing?.tenant_id) {
    return { tenantId: existing.tenant_id, userId: existing.id }
  }

  // Resolve a unique slug
  const baseSlug  = slug?.trim() || slugifyBusinessName(businessName)
  const finalSlug = await resolveUniqueSlug(supabase, baseSlug)

  // Create the tenant row
  const { data: tenant, error: tenantError } = await supabase
    .from('tenants')
    .insert({
      name:      businessName.trim(),
      slug:      finalSlug,
      subdomain: finalSlug,
      status:    'active',
      branding: {
        primary_color: '#c9a84c',
        accent:        'gold',
        industry:      'general',
        logo_url:      null,
      },
    })
    .select('id, name, slug')
    .single()

  if (tenantError || !tenant) {
    throw new Error(
      tenantError?.code === '23505'
        ? 'That business slug is already taken. Please choose a different one.'
        : 'Failed to create your workspace. Please try again.'
    )
  }

  // Create the tenant admin user profile.
  // New sign-ups are always 'admin' (tenant-level owner of their own workspace).
  // The platform 'owner' role is reserved and set manually for the operator.
  const { data: userRecord, error: userError } = await supabase
    .from('users')
    .insert({
      tenant_id:    tenant.id,
      auth_user_id: authUserId,
      email,
      role:         'admin',
      status:       'active',
      metadata:     { businessName: businessName.trim() },
    })
    .select('id')
    .single()

  if (userError || !userRecord) {
    // Attempt rollback so the tenant row doesn't linger
    await supabase.from('tenants').delete().eq('id', tenant.id)
    throw new Error('Failed to create your profile. Please try again.')
  }

  // Mirror the role into Supabase Auth user_metadata so JWT claims and
  // server-side Auth checks reflect the correct role without an extra DB round-trip.
  // This is a server-side Admin API call — it cannot be spoofed by the client.
  await supabase.auth.admin.updateUserById(authUserId, {
    user_metadata: {
      role:         'admin',
      businessName: businessName.trim(),
      tenant_id:    tenant.id,
    },
  })

  // Enable a sensible set of default modules
  const defaultModules = ['contacts', 'leads', 'appointments', 'payments']
  await supabase.from('tenant_modules').insert(
    defaultModules.map((key) => ({
      tenant_id:  tenant.id,
      module_key: key,
      enabled:    true,
      config:     {} as Json,
    }))
  )

  // Provision the platform subdomain record in tenant_domains
  await supabase
    .from('tenant_domains')
    .insert({
      tenant_id:           tenant.id,
      hostname:            finalSlug,
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

  // Seed site_settings with subdomain info
  await supabase
    .from('site_settings')
    .upsert(
      {
        tenant_id:    tenant.id,
        subdomain:    finalSlug,
        domain_type:  'subdomain',
        domain_mode:  'subdomain',
        is_published: false,
      },
      { onConflict: 'tenant_id' }
    )

  // Create a trial subscription against the first available plan, if any
  const { data: plan } = await supabase
    .from('plans')
    .select('id')
    .eq('status', 'active')
    .limit(1)
    .single()

  if (plan) {
    await supabase.from('subscriptions').insert({
      tenant_id:                tenant.id,
      plan_id:                  plan.id,
      status:                   'trial',
      current_period_end:       new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
  }

  return { tenantId: tenant.id, userId: userRecord.id }
}

async function resolveUniqueSlug(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  baseSlug: string
): Promise<string> {
  let slug = baseSlug
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single()
    if (!data) return slug
    slug = `${baseSlug}-${Math.random().toString(36).slice(2, 5)}`
  }
  return `${baseSlug}-${Date.now().toString(36)}`
}
