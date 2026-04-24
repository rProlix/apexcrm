// lib/modules/setModuleEnabled.ts
import { getSupabaseServerClient } from '@/lib/supabase/server'

export interface SetModuleResult {
  success:  boolean
  error?:   string
}

/**
 * Upserts the enabled state for a module on a specific tenant.
 *
 * Only the platform owner should be allowed to call this function.
 * Callers are responsible for RBAC enforcement before invoking.
 *
 * @param tenantId  - Tenant UUID
 * @param moduleKey - Module key (e.g. 'payments', 'rewards')
 * @param enabled   - New enabled state
 * @param config    - Optional JSONB config to merge/set alongside the flag
 */
export async function setModuleEnabled(
  tenantId:  string,
  moduleKey: string,
  enabled:   boolean,
  config?:   Record<string, unknown>,
): Promise<SetModuleResult> {
  const supabase = getSupabaseServerClient()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: any = {
    tenant_id:  tenantId,
    module_key: moduleKey,
    enabled,
    config:     config ?? {},
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('tenant_modules')
    .upsert(payload, { onConflict: 'tenant_id,module_key' })

  if (error) {
    console.error('[setModuleEnabled] upsert error:', error.message)
    return { success: false, error: error.message }
  }

  return { success: true }
}
