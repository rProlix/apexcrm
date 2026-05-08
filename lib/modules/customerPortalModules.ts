// lib/modules/customerPortalModules.ts
// Maps tenant module keys to customer-facing portal capabilities.
// Server-only — do not import in client components.

import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getDefaultModuleState } from '@/lib/modules/defaultModules'

export interface CustomerPortalModules {
  appointments: boolean  // appointments module
  orders:       boolean  // store / ecommerce module → order history
  rewards:      boolean  // rewards module
  payments:     boolean  // payments module
  profile:      boolean  // always true
}

/**
 * Returns the set of customer-facing portal modules enabled for a tenant.
 * Maps internal module keys to customer portal capabilities.
 */
export async function getCustomerPortalModules(tenantId: string): Promise<CustomerPortalModules> {
  const supabase = getSupabaseServerClient()

  const { data, error } = await supabase
    .from('tenant_modules')
    .select('module_key, enabled')
    .eq('tenant_id', tenantId)

  if (error) {
    console.error('[getCustomerPortalModules] DB error:', error.message)
  }

  const dbMap = new Map<string, boolean>(
    (data ?? []).map((r) => [r.module_key, r.enabled as boolean])
  )

  function isEnabled(key: string): boolean {
    const stored = dbMap.get(key)
    return stored !== undefined ? stored : getDefaultModuleState(key)
  }

  return {
    appointments: isEnabled('appointments'),
    orders:       isEnabled('store'),
    rewards:      isEnabled('rewards'),
    payments:     isEnabled('payments'),
    profile:      true, // always available
  }
}
