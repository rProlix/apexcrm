import { getSupabaseServerClient } from '@/lib/supabase/server'
import type { TenantRecord } from '@/lib/tenant/getTenantFromHost'

export interface TenantModule {
  module_key: string
  enabled: boolean
  config: Record<string, unknown>
}

export interface TenantConfig {
  tenant: TenantRecord
  modules: TenantModule[]
  enabledModuleKeys: string[]
  branding: {
    primary_color: string
    logo_url: string | null
    accent: string
    industry: string
    [key: string]: unknown
  }
}

/**
 * Loads the full tenant configuration including enabled modules and branding.
 * Called in server components / layouts after tenant resolution.
 */
export async function loadTenantConfig(tenantId: string): Promise<TenantConfig | null> {
  const supabase = getSupabaseServerClient()

  const [tenantResult, modulesResult] = await Promise.all([
    supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .eq('status', 'active')
      .single(),
    supabase
      .from('tenant_modules')
      .select('module_key, enabled, config')
      .eq('tenant_id', tenantId),
  ])

  if (tenantResult.error || !tenantResult.data) return null

  const tenant = tenantResult.data as TenantRecord
  const modules = (modulesResult.data ?? []) as TenantModule[]
  const enabledModuleKeys = modules.filter((m) => m.enabled).map((m) => m.module_key)

  const branding = (tenant.branding ?? {}) as TenantConfig['branding']

  return {
    tenant,
    modules,
    enabledModuleKeys,
    branding: Object.assign(
      { primary_color: '#c9a84c', logo_url: null, accent: 'gold', industry: 'general' },
      branding,
    ) as TenantConfig['branding'],
  }
}
