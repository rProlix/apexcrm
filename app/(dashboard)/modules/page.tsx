export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { loadTenantConfig } from '@/lib/tenant/loadTenantConfig'
import { MODULE_REGISTRY } from '@/modules/registry'
import { Card } from '@/components/ui/Card'
import { Pill } from '@/components/ui/Pill'

export default async function ModulesPage() {
  const host   = (await headers()).get('host') ?? ''
  const tenant = await getTenantFromHost(host)
  if (!tenant) return null

  const config = await loadTenantConfig(tenant.id)
  if (!config) return null

  const allModules = Object.values(MODULE_REGISTRY)

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Modules</h1>
        <p className="text-sm text-white/40">
          All available modules for your plan. Contact your platform admin to enable or disable features.
        </p>
      </div>

      <div className="space-y-3">
        {allModules.map((mod) => {
          const tenantMod  = config.modules.find((m) => m.module_key === mod.key)
          const enabled    = tenantMod?.enabled ?? false
          const Icon       = mod.icon

          return (
            <Card key={mod.key} className="!p-4">
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${mod.bgColor} border border-white/10`}>
                  <Icon className={`h-5 w-5 ${mod.color}`} strokeWidth={1.75} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{mod.label}</p>
                  <p className="text-xs text-white/40 truncate">{mod.description}</p>
                </div>

                {/* Status */}
                <Pill
                  label={enabled ? 'Enabled' : 'Disabled'}
                  status={enabled ? 'active' : 'retired'}
                />
              </div>

              {/* Config preview */}
              {enabled && tenantMod?.config && Object.keys(tenantMod.config).length > 0 && (
                <div className="mt-3 ml-14 pt-3 border-t border-white/5">
                  <p className="text-2xs text-white/25 uppercase tracking-widest mb-2">Config</p>
                  <pre className="text-xs text-white/40 font-mono overflow-x-auto">
                    {JSON.stringify(tenantMod.config, null, 2)}
                  </pre>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
