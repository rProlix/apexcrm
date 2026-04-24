// lib/modules/getTenantModulesWithDefaults.ts
// Extends getTenantModules with an explicit `is_from_default` flag so callers
// can distinguish between "explicitly set by owner" and "using system default".
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MODULE_REGISTRY } from '@/modules/registry'
import { getDefaultModuleState } from '@/lib/modules/defaultModules'
import type { ModuleKey } from '@/modules/shared/moduleTypes'
import type { TenantModuleState } from '@/lib/modules/getTenantModules'

export interface ModuleWithDefaults extends TenantModuleState {
  /** true when is_enabled comes from DEFAULT_MODULE_STATES (no DB record) */
  is_from_default: boolean
}

/**
 * Returns all registry modules for a tenant merged with DB records.
 *
 * Differences from getTenantModules:
 *  - exposes `is_from_default` so UIs can label unset modules
 *  - suitable for owner admin UIs that need full module visibility
 *
 * Modules absent from tenant_modules fall back to DEFAULT_MODULE_STATES and
 * are tagged `is_from_default: true`.
 */
export async function getTenantModulesWithDefaults(
  tenantId: string
): Promise<ModuleWithDefaults[]> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('tenant_modules')
    .select('module_key, enabled, config')
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[getTenantModulesWithDefaults] DB error:', error.message)
  }

  const dbMap = new Map(
    (data ?? []).map((r) => [
      r.module_key as string,
      {
        enabled: r.enabled as boolean,
        config:  (r.config ?? {}) as Record<string, unknown>,
      },
    ])
  )

  return (Object.keys(MODULE_REGISTRY) as ModuleKey[])
    .map((key) => {
      const mod           = MODULE_REGISTRY[key]
      const db            = dbMap.get(key)
      const is_from_default = db === undefined

      return {
        key,
        label:           mod.label,
        description:     mod.description,
        href:            mod.href,
        color:           mod.color,
        bgColor:         mod.bgColor,
        order:           mod.order,
        is_enabled:      is_from_default ? getDefaultModuleState(key) : db!.enabled,
        config:          is_from_default ? {} : db!.config,
        is_from_default,
      }
    })
    .sort((a, b) => a.order - b.order)
}
