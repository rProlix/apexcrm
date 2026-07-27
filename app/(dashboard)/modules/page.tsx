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

  // Only the platform owner can manage module access. Business admins can only
  // see modules that have already been enabled for their workspace.
  const sessionClient = await createSessionServerClient()
  const { data: { user } } = await sessionClient.auth.getUser()
  const admin = getSupabaseServerClient()
  const { data: userRecord } = user
    ? await admin.from('users').select('role').eq('auth_user_id', user.id).maybeSingle()
    : { data: null }
  const canToggle = userRecord?.role === 'owner'

  const visibleModules = config.modules
    .filter((module) => module.enabled)
    .map((tenantModule) => ({
      definition: MODULE_REGISTRY[tenantModule.module_key as keyof typeof MODULE_REGISTRY],
      tenantModule,
    }))
    .filter(
      (
        item
      ): item is {
        definition: (typeof MODULE_REGISTRY)[keyof typeof MODULE_REGISTRY]
        tenantModule: (typeof config.modules)[number]
      } => Boolean(item.definition)
    )
    .sort((a, b) => a.definition.order - b.definition.order)
  const enabledCount = visibleModules.length

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
            {enabledCount} active
          </span>
        </div>
      </div>

      {/* Module list */}
      <div className="space-y-2">
        {visibleModules.map(({ definition: mod, tenantModule }) => {
          const enabled = tenantModule.enabled
          const Icon = mod.icon

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
                  <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/45">
                    Owner managed
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {!visibleModules.length && (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
          <p className="text-sm font-medium text-white/65">No modules are enabled for this business yet.</p>
          <p className="mt-1 text-xs text-white/35">
            Module access is controlled by the platform owner.
          </p>
        </div>
      )}

      {!canToggle && visibleModules.length > 0 && (
        <p className="text-xs text-white/25 text-center pt-2">
          Module access is controlled by the platform owner.
        </p>
      )}
    </div>
  )
}
