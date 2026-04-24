import { getSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Sets the Postgres session-level tenant context so RLS policies work correctly.
 * Must be called before any RLS-protected query on tenant-owned tables.
 *
 * Usage:
 *   const supabase = await setTenantContext(tenantId)
 *   const { data } = await supabase.from('customers').select('*')
 */
export async function setTenantContext(tenantId: string) {
  const supabase = getSupabaseServerClient()

  await supabase.rpc('set_tenant_context', { p_tenant_id: tenantId })

  return supabase
}

/**
 * Sets platform admin context — bypasses tenant RLS.
 * Only use for platform admin operations.
 */
export async function setPlatformAdminContext() {
  const supabase = getSupabaseServerClient()

  // Platform admin flag is set via the service role key automatically
  // Additional flag for app-level policies
  await supabase.rpc('set_platform_admin_context')

  return supabase
}

/**
 * Wraps a callback with tenant context set for the duration of the call.
 * Useful for service functions that need to be tenant-aware.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (supabase: ReturnType<typeof getSupabaseServerClient>) => Promise<T>
): Promise<T> {
  const supabase = await setTenantContext(tenantId)
  return fn(supabase)
}
