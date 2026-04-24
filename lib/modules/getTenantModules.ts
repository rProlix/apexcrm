// lib/modules/getTenantModules.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MODULE_REGISTRY } from '@/modules/registry'
import { getDefaultModuleState } from '@/lib/modules/defaultModules'
import type { ModuleKey } from '@/modules/shared/moduleTypes'

export interface TenantModuleState {
  key:        ModuleKey
  label:      string
  description: string
  href:        string
  color:       string
  bgColor:     string
  order:       number
  is_enabled:  boolean
  config:      Record<string, unknown>
}

/**
 * Returns the full list of known modules for a tenant, merging database records
 * with fallback defaults from DEFAULT_MODULE_STATES.
 *
 * Always returns every module in MODULE_REGISTRY — callers decide how to render
 * disabled ones (greyed-out vs hidden).
 */
export async function getTenantModules(tenantId: string): Promise<TenantModuleState[]> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('tenant_modules')
    .select('module_key, enabled, config')
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[getTenantModules] DB error:', error.message)
  }

  const dbMap = new Map(
    (data ?? []).map((r) => [
      r.module_key,
      { enabled: r.enabled as boolean, config: (r.config ?? {}) as Record<string, unknown> },
    ])
  )

  return (Object.keys(MODULE_REGISTRY) as ModuleKey[])
    .map((key) => {
      const mod = MODULE_REGISTRY[key]
      const db  = dbMap.get(key)
      return {
        key,
        label:       mod.label,
        description: mod.description,
        href:        mod.href,
        color:       mod.color,
        bgColor:     mod.bgColor,
        order:       mod.order,
        is_enabled:  db !== undefined ? db.enabled : getDefaultModuleState(key),
        config:      db?.config ?? {},
      }
    })
    .sort((a, b) => a.order - b.order)
}
