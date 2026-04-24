// lib/modules/isModuleEnabled.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getDefaultModuleState } from '@/lib/modules/defaultModules'

/**
 * Returns true when the given module is enabled for a tenant.
 *
 * Resolution order:
 *  1. Row in tenant_modules → use the stored enabled flag
 *  2. No row found          → fall back to DEFAULT_MODULE_STATES
 *
 * The platform owner always has access regardless of module state — callers
 * responsible for RBAC should bypass this check when userRole === 'owner'.
 *
 * @param tenantId  - Tenant UUID
 * @param moduleKey - Module key (e.g. 'payments', 'rewards')
 */
export async function isModuleEnabled(
  tenantId:  string,
  moduleKey: string,
): Promise<boolean> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('tenant_modules')
    .select('enabled')
    .eq('tenant_id', tenantId)
    .eq('module_key', moduleKey)
    .maybeSingle()

  if (error) {
    console.error('[isModuleEnabled] DB error:', error.message)
    return getDefaultModuleState(moduleKey)
  }

  if (data === null) {
    return getDefaultModuleState(moduleKey)
  }

  return data.enabled as boolean
}
