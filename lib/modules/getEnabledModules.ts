// lib/modules/getEnabledModules.ts
// Server-side extension of the module registry.
// Provides async helpers that cross-reference the registry with the database.
// Do NOT import this file in client components — use loadEnabledModules instead.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MODULE_REGISTRY } from '@/modules/registry'
import { getDefaultModuleState } from '@/lib/modules/defaultModules'
import type { ModuleDefinition, ModuleKey } from '@/modules/shared/moduleTypes'

/**
 * Returns the full ModuleDefinition list for modules that are currently enabled
 * for a tenant, sorted by their registered order.
 *
 * Equivalent to loadTenantConfig + loadEnabledModules but without loading the
 * full tenant record — useful when you only need the module list.
 *
 * @param tenantId - Tenant UUID
 */
export async function getEnabledModules(tenantId: string): Promise<ModuleDefinition[]> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('tenant_modules')
    .select('module_key, enabled')
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[getEnabledModules] DB error:', error.message)
  }

  const dbMap = new Map(
    (data ?? []).map((r) => [r.module_key, r.enabled as boolean])
  )

  return (Object.keys(MODULE_REGISTRY) as ModuleKey[])
    .filter((key) => {
      const stored = dbMap.get(key)
      return stored !== undefined ? stored : getDefaultModuleState(key)
    })
    .map((key) => MODULE_REGISTRY[key])
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
}

/**
 * Returns true when a specific module is enabled for the tenant.
 * Owner callers should bypass this by checking role === 'owner' themselves.
 *
 * @param tenantId  - Tenant UUID
 * @param moduleKey - Module key to check
 */
export async function isModuleEnabledForTenant(
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
    console.error('[isModuleEnabledForTenant] DB error:', error.message)
    return getDefaultModuleState(moduleKey)
  }

  return data !== null ? (data.enabled as boolean) : getDefaultModuleState(moduleKey)
}
