export const dynamic = 'force-dynamic'

// app/(admin)/admin/tenants/page.tsx
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import {
  Building2, Users, Package, Calendar, Globe,
  CheckCircle2, XCircle, AlertTriangle,
} from 'lucide-react'
import { TenantStatusButton, SuspendButton } from '../TenantStatusButton'
import { ModuleToggleButton } from '../ModuleToggleButton'
import { Card } from '@/components/ui/Card'

const ALL_MODULES = [
  'contacts', 'leads', 'appointments', 'payments',
  'rewards', 'vehicles', 'damage_ai', 'messages', 'store',
  'website', 'customers', 'product_360_spin',
]

export const metadata = { title: 'Tenants — Platform Admin' }

export default async function AdminTenantsPage() {
  const supabase = getSupabaseServerClient()

  const [
    { data: tenantsRaw },
    { data: tenantModulesRaw },
    { data: userCountsRaw },
    { data: customerCountsRaw },
  ] = await Promise.all([
    supabase
      .from('tenants')
      .select('id, name, slug, subdomain, custom_domain, status, created_at, subscriptions(status, current_period_end, plan_id)')
      .order('created_at', { ascending: false }),
    supabase
      .from('tenant_modules')
      .select('tenant_id, module_key, enabled'),
    supabase
      .from('users')
      .select('tenant_id')
      .not('tenant_id', 'is', null),
    supabase
      .from('customers')
      .select('tenant_id'),
  ])

  const tenants = (tenantsRaw ?? []) as unknown as Array<{
    id: string; name: string; slug: string; subdomain: string | null
    custom_domain: string | null; status: string; created_at: string
    subscriptions: Array<{ status: string; current_period_end: string | null; plan_id: string | null }>
  }>

  const tenantModules = (tenantModulesRaw ?? []) as Array<{
    tenant_id: string; module_key: string; enabled: boolean
  }>

  // Build module map and user/customer counts
  const moduleMap: Record<string, Record<string, boolean>> = {}
  for (const row of tenantModules) {
    if (!moduleMap[row.tenant_id]) moduleMap[row.tenant_id] = {}
    moduleMap[row.tenant_id][row.module_key] = row.enabled
  }

  const userCountMap: Record<string, number> = {}
  for (const u of (userCountsRaw ?? [])) {
    if (u.tenant_id) userCountMap[u.tenant_id] = (userCountMap[u.tenant_id] ?? 0) + 1
  }

  const customerCountMap: Record<string, number> = {}
  for (const c of (customerCountsRaw ?? [])) {
    if (c.tenant_id) customerCountMap[c.tenant_id] = (customerCountMap[c.tenant_id] ?? 0) + 1
  }

  const active    = tenants.filter((t) => t.status === 'active').length
  const inactive  = tenants.filter((t) => t.status === 'inactive').length
  const suspended = tenants.filter((t) => t.status === 'suspended').length

  const statusIcon = (status: string) => {
    if (status === 'active')    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
    if (status === 'suspended') return <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
    return <XCircle className="h-3.5 w-3.5 text-white/30" />
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Business Management</h1>
        <p className="text-sm text-white/40">
          All registered businesses — activate, suspend, or manage module access
        </p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: tenants.length, icon: Building2,    color: 'text-gold-400',    bg: 'bg-gold-500/8'    },
          { label: 'Active',    value: active,          icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/8' },
          { label: 'Inactive',  value: inactive,        icon: XCircle,      color: 'text-white/40',    bg: 'bg-white/4'       },
          { label: 'Suspended', value: suspended,       icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/8'   },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="rounded-2xl border border-surface-border bg-graphite-900/60 px-4 py-4">
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} strokeWidth={1.75} />
            </div>
            <p className="text-2xl font-bold text-white leading-none mb-1">{value}</p>
            <p className="text-xs text-white/35 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Business cards */}
      <div className="space-y-4">
        <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest">
          {tenants.length} Business{tenants.length !== 1 ? 'es' : ''}
        </h2>

        {tenants.length === 0 && (
          <div className="text-center py-16 rounded-2xl border border-surface-border bg-graphite-900/40">
            <Building2 className="h-10 w-10 text-white/10 mx-auto mb-3" />
            <p className="text-white/30 text-sm">No businesses have signed up yet.</p>
          </div>
        )}

        {tenants.map((t) => {
          const sub         = t.subscriptions?.[0]
          const modules     = moduleMap[t.id] ?? {}
          const userCount   = userCountMap[t.id] ?? 0
          const custCount   = customerCountMap[t.id] ?? 0
          const enabledMods = ALL_MODULES.filter((k) => modules[k])

          return (
            <Card key={t.id} className="!p-0 overflow-hidden">
              {/* Card header */}
              <div className="flex items-start justify-between px-5 py-4 border-b border-white/6">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-gold-500/20 to-gold-600/10 border border-gold-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-gold-400 font-bold text-xs">
                      {t.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      {statusIcon(t.status)}
                      <h3 className="text-sm font-semibold text-white">{t.name}</h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-white/35">
                      <span className="font-mono">{t.slug}</span>
                      {t.subdomain && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1">
                            <Globe className="h-3 w-3" />
                            {t.subdomain}
                          </span>
                        </>
                      )}
                      {t.custom_domain && (
                        <>
                          <span>·</span>
                          <span className="flex items-center gap-1 text-blue-400/60">
                            <Globe className="h-3 w-3" />
                            {t.custom_domain}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <SuspendButton tenantId={t.id} currentStatus={t.status} />
                  <TenantStatusButton tenantId={t.id} currentStatus={t.status} />
                </div>
              </div>

              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-6 px-5 py-3 border-b border-white/4 bg-white/[0.01]">
                <span className="flex items-center gap-1.5 text-xs text-white/40">
                  <Users className="h-3.5 w-3.5 text-white/25" />
                  {userCount} staff
                </span>
                <span className="flex items-center gap-1.5 text-xs text-white/40">
                  <Users className="h-3.5 w-3.5 text-white/25" />
                  {custCount} customers
                </span>
                <span className="flex items-center gap-1.5 text-xs text-white/40">
                  <Package className="h-3.5 w-3.5 text-white/25" />
                  {enabledMods.length} module{enabledMods.length !== 1 ? 's' : ''} active
                </span>
                <span className="flex items-center gap-1.5 text-xs text-white/40">
                  <Calendar className="h-3.5 w-3.5 text-white/25" />
                  Joined {formatDate(t.created_at)}
                </span>
                {sub && (
                  <span className={`text-xs px-2 py-0.5 rounded-lg border ml-auto ${
                    sub.status === 'active'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-white/5 border-white/10 text-white/30'
                  }`}>
                    {sub.status} plan
                  </span>
                )}
              </div>

              {/* Module toggles */}
              <div className="px-5 py-4">
                <p className="text-2xs font-semibold text-white/20 uppercase tracking-widest mb-3">
                  Module Access
                </p>
                <div className="flex flex-wrap gap-2">
                  {ALL_MODULES.map((key) => (
                    <ModuleToggleButton
                      key={key}
                      tenantId={t.id}
                      moduleKey={key}
                      enabled={modules[key] ?? false}
                    />
                  ))}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
