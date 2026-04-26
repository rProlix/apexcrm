export const dynamic = 'force-dynamic'

// app/(admin)/admin/page.tsx
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { Card } from '@/components/ui/Card'
import { formatDate } from '@/lib/utils'
import { Building2, Users, Activity, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { ModuleToggleButton } from './ModuleToggleButton'
import { TenantStatusButton } from './TenantStatusButton'

const ALL_MODULES = [
  'contacts',
  'leads',
  'appointments',
  'payments',
  'rewards',
  'vehicles',
  'damage_ai',
  'messages',
  'store',
]

export default async function AdminOverviewPage() {
  const ctx     = await getUserContext()
  const supabase = getSupabaseServerClient()

  // Fetch all tenants with their subscription and module info
  const { data: tenantsRaw } = await supabase
    .from('tenants')
    .select('id, name, slug, subdomain, status, created_at, subscriptions(status, current_period_end, plan_id)')
    .order('created_at', { ascending: false })

  const tenants = (tenantsRaw ?? []) as unknown as Array<{
    id: string; name: string; slug: string; subdomain: string | null
    status: string; created_at: string
    subscriptions: Array<{ status: string; current_period_end: string | null; plan_id: string | null }>
  }>

  // Fetch all tenant_modules for the toggle UI
  const { data: tenantModulesRaw } = await supabase
    .from('tenant_modules')
    .select('tenant_id, module_key, enabled')

  const tenantModules = (tenantModulesRaw ?? []) as Array<{
    tenant_id: string; module_key: string; enabled: boolean
  }>

  // Build a fast lookup: tenantId → moduleKey → enabled
  const moduleMap: Record<string, Record<string, boolean>> = {}
  for (const row of tenantModules) {
    if (!moduleMap[row.tenant_id]) moduleMap[row.tenant_id] = {}
    moduleMap[row.tenant_id][row.module_key] = row.enabled
  }

  // Platform-level stats
  const totalTenants  = tenants.length
  const activeTenants = tenants.filter((t) => t.status === 'active').length

  const { count: totalUsers } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })

  const { count: totalCustomers } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })

  const stats = [
    { label: 'Total Tenants',  value: totalTenants,            icon: Building2 },
    { label: 'Active Tenants', value: activeTenants,           icon: Activity  },
    { label: 'Total Users',    value: totalUsers    ?? 0,      icon: Users     },
    { label: 'Total Customers',value: totalCustomers ?? 0,     icon: Users     },
  ]

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-1">Platform Overview</h1>
        <p className="text-sm text-white/40">
          Signed in as <span className="text-white/60 font-mono">{ctx?.email}</span>
        </p>
      </div>

      {/* Platform stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div
            key={label}
            className="rounded-2xl border border-surface-border bg-graphite-900/60 px-5 py-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
              <span className="text-xs text-white/40 font-medium">{label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Tenant table with module toggles */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-widest">
            Businesses &amp; Module Control
          </h2>
          <Link
            href="/admin/tenants"
            className="inline-flex items-center gap-1.5 text-xs text-gold-400/70 hover:text-gold-400 transition-colors"
          >
            Detailed view <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <Card className="!p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/6">
                  {['Business', 'Slug', 'Plan', 'Created', 'Status', 'Modules'].map((col) => (
                    <th
                      key={col}
                      className="text-left text-xs font-semibold text-white/30 uppercase tracking-widest px-5 py-3 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {tenants.map((t) => {
                  const sub      = t.subscriptions?.[0]
                  const modules  = moduleMap[t.id] ?? {}
                  return (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors align-top">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-gold-500/10 border border-gold-500/15 flex items-center justify-center shrink-0">
                            <span className="text-gold-400 font-bold text-2xs">
                              {t.name.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-medium text-white text-sm">{t.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-white/40 font-mono text-xs whitespace-nowrap">{t.slug}</td>
                      <td className="px-5 py-4 text-white/40 text-xs whitespace-nowrap">
                        {sub?.status ?? '—'}
                      </td>
                      <td className="px-5 py-4 text-white/30 text-xs whitespace-nowrap">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <TenantStatusButton tenantId={t.id} currentStatus={t.status} />
                      </td>
                      {/* Module toggles */}
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-2">
                          {ALL_MODULES.map((key) => {
                            const enabled = modules[key] ?? false
                            return (
                              <ModuleToggleButton
                                key={key}
                                tenantId={t.id}
                                moduleKey={key}
                                enabled={enabled}
                              />
                            )
                          })}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {tenants.length === 0 && (
              <p className="text-center text-white/25 text-sm py-12">No businesses found.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
