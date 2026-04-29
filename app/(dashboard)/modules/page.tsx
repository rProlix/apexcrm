export const dynamic = 'force-dynamic'

import { headers } from 'next/headers'
import { getTenantFromHost } from '@/lib/tenant/getTenantFromHost'
import { loadTenantConfig } from '@/lib/tenant/loadTenantConfig'
import { getSupabaseServerClient, createSessionServerClient } from '@/lib/supabase/server'
import { MODULE_REGISTRY } from '@/modules/registry'
import { ModuleToggle } from '@/components/modules/ModuleToggle'

export default async function ModulesPage() {
  const host = (await headers()).get('host') ?? ''
  let tenant = await getTenantFromHost(host)

  // Fallback: resolve via authenticated user's tenant
  if (!tenant) {
    const sessionClient = await createSessionServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()
    if (user) {
      const admin = getSupabaseServerClient()
      const { data: userRecord } = await admin
        .from('users')
        .select('tenant_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (userRecord?.tenant_id) {
        const { data } = await admin
          .from('tenants')
          .select('*')
          .eq('id', userRecord.tenant_id)
          .single()
        tenant = data as typeof tenant
      }
    }
  }

  if (!tenant) return null

  const config = await loadTenantConfig(tenant.id)
  if (!config) return null

  // Check if current user can toggle modules (admin or owner only)
  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  const admin = getSupabaseServerClient()
  const { data: userRecord } = user
    ? await admin.from('users').select('role').eq('auth_user_id', user.id).maybeSingle()
    : { data: null }
  const canToggle = userRecord?.role === 'admin' || userRecord?.role === 'owner'

  const allModules = Object.values(MODULE_REGISTRY)
  const enabledCount = config.enabledModuleKeys.length

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Modules</h1>
          <p className="text-sm text-white/40">
            Toggle features on or off. Changes take effect immediately.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border border-gold-500/20 bg-gold-500/8">
          <span className="h-2 w-2 rounded-full bg-gold-400 animate-pulse" />
          <span className="text-xs font-semibold text-gold-400">
            {enabledCount} of {allModules.length} active
          </span>
        </div>
      </div>

      {/* Module list */}
      <div className="space-y-2">
        {allModules.map((mod) => {
          const tenantMod = config.modules.find((m) => m.module_key === mod.key)
          const enabled   = tenantMod?.enabled ?? false
          const Icon      = mod.icon

          return (
            <div
              key={mod.key}
              className="rounded-2xl border border-surface-border bg-graphite-900/40 px-5 py-4 transition-colors duration-200 hover:bg-graphite-900/60"
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div
                  className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${mod.bgColor} border border-white/10`}
                >
                  <Icon className={`h-5 w-5 ${mod.color}`} strokeWidth={1.75} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-white">{mod.label}</p>
                    <span
                      className={`text-2xs px-2 py-0.5 rounded-full font-medium ${
                        enabled
                          ? 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/20'
                          : 'bg-white/5 text-white/25 border border-white/8'
                      }`}
                    >
                      {enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-white/40 mt-0.5">{mod.description}</p>
                </div>

                {/* Toggle */}
                {canToggle ? (
                  <ModuleToggle
                    tenantId={tenant!.id}
                    moduleKey={mod.key}
                    enabled={enabled}
                  />
                ) : (
                  <div
                    className={`h-6 w-11 rounded-full border-2 border-transparent opacity-40 cursor-not-allowed ${
                      enabled ? 'bg-gold-500' : 'bg-graphite-600'
                    }`}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!canToggle && (
        <p className="text-xs text-white/25 text-center pt-2">
          Contact your workspace admin to enable or disable modules.
        </p>
      )}
    </div>
  )
}
