export const dynamic = 'force-dynamic'

// app/(dashboard)/dashboard/page.tsx
import { headers } from 'next/headers'
import { getTenantFromHost, type TenantRecord } from '@/lib/tenant/getTenantFromHost'
import { loadTenantConfig } from '@/lib/tenant/loadTenantConfig'
import { loadLayout } from '@/lib/dashboard/loadLayout'
import { WIDGET_REGISTRY } from '@/lib/dashboard/widgetRegistry'
import { suggestMetrics } from '@/lib/ai/suggestMetrics'
import { DashboardBuilder } from '@/components/dashboard/DashboardBuilder'
import { LiveBadge } from '@/components/ui/LiveBadge'
import { createSessionServerClient, getSupabaseServerClient } from '@/lib/supabase/server'
import { getUserContext } from '@/lib/auth/getUserContext'
import { hasPermission } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/utils'
import {
  Building2, Users, TrendingUp, Shield,
  ArrowRight, Package, AlertTriangle, CheckCircle2, XCircle,
} from 'lucide-react'
import Link from 'next/link'
import { TenantStatusButton } from '@/app/(admin)/admin/TenantStatusButton'
import type { WidgetData } from '@/lib/dashboard/types'
import { DashboardSetupChecklist } from '@/components/onboarding/DashboardSetupChecklist'

export default async function DashboardPage() {
  const host  = (await headers()).get('host') ?? ''
  const admin = getSupabaseServerClient()

  // ── Determine role context ────────────────────────────────────────────
  const userCtx = await getUserContext()
  const userRole = userCtx?.role ?? 'admin'

  // Platform owner sees a global overview dashboard
  if (userRole === 'owner') {
    return <OwnerDashboard email={userCtx?.email ?? ''} admin={admin} />
  }

  let tenant: TenantRecord | null = await getTenantFromHost(host)

  // On localhost (and any host without a subdomain), fall back to the
  // authenticated user's own tenant so the page is never empty in development.
  if (!tenant) {
    const sessionClient = await createSessionServerClient()
    const { data: { user } } = await sessionClient.auth.getUser()

    if (user) {
      const { data: userRecord } = await admin
        .from('users')
        .select('tenant_id')
        .eq('auth_user_id', user.id)
        .single()

      if (userRecord?.tenant_id) {
        const { data } = await admin
          .from('tenants')
          .select('*')
          .eq('id', userRecord.tenant_id)
          .eq('status', 'active')
          .single()
        tenant = (data as unknown as TenantRecord) ?? null
      }
    }
  }

  // Dev fallback: use the first active tenant when no user-specific tenant found
  if (!tenant && process.env.NODE_ENV === 'development') {
    const { data } = await admin
      .from('tenants')
      .select('*')
      .eq('status', 'active')
      .limit(1)
      .single()
    tenant = (data as unknown as TenantRecord) ?? null
  }

  if (!tenant) return null

  const config = await loadTenantConfig(tenant.id)
  if (!config) return null

  // Staff can only view the dashboard — gate heavier operations
  if (!hasPermission(userRole, 'view_dashboard')) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-white/40 text-sm">You do not have access to this dashboard.</p>
      </div>
    )
  }

  // Load tenant's saved layout
  const layout = await loadLayout(tenant.id)

  // Collect every widget key present in the layout
  const layoutWidgetKeys = layout.sections.flatMap((s) => s.widgets.map((w) => w.key))

  // Fetch widget data for all widgets currently in the layout
  const widgetDataEntries = await Promise.all(
    layoutWidgetKeys.map(async (key): Promise<[string, WidgetData]> => {
      const def = WIDGET_REGISTRY[key]
      if (!def) return [key, { type: 'stat', value: 0, formatted: '—', label: key } as WidgetData]
      try {
        const data = await def.fetcher(tenant.id)
        return [key, data]
      } catch {
        return [key, { type: 'stat', value: 0, formatted: '—', label: key } as WidgetData]
      }
    })
  )
  const widgetDataMap: Record<string, WidgetData> = Object.fromEntries(widgetDataEntries)

  // AI-suggested widget keys (not already in layout)
  const suggestedKeys = suggestMetrics({
    enabledModuleKeys: config.enabledModuleKeys,
    currentLayout:     layout,
  })

  // Slim registry metadata safe to pass to client (no fetcher functions)
  const registryMeta = Object.fromEntries(
    Object.values(WIDGET_REGISTRY).map((def) => [
      def.key,
      {
        key:            def.key,
        label:          def.label,
        description:    def.description,
        type:           def.type,
        defaultSection: def.defaultSection,
      },
    ])
  )

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">{config.tenant.name}</h1>
            <LiveBadge />
          </div>
          <p className="text-sm text-white/40">
            {config.enabledModuleKeys.length} module{config.enabledModuleKeys.length !== 1 ? 's' : ''} active
          </p>
        </div>
      </div>

      {/* Setup checklist (only shown for new tenants) */}
      <DashboardSetupChecklist enabledModules={config.enabledModuleKeys} tenantId={tenant.id} />

      {/* Dashboard builder — drag-and-drop + suggestions */}
      <DashboardBuilder
        tenantId={tenant.id}
        initialLayout={layout}
        widgetDataMap={widgetDataMap}
        suggestedKeys={suggestedKeys}
        widgetRegistry={registryMeta}
      />
    </div>
  )
}

// ── Platform Owner Dashboard ──────────────────────────────────────────────────

async function OwnerDashboard({
  email,
  admin,
}: {
  email: string
  admin: ReturnType<typeof getSupabaseServerClient>
}) {
  const [
    { count: totalTenants },
    { count: activeTenants },
    { count: inactiveTenants },
    { count: suspendedTenants },
    { count: totalUsers },
    { count: totalCustomers },
    { data: allTenants },
    { data: tenantModulesRaw },
  ] = await Promise.all([
    admin.from('tenants').select('id', { count: 'exact', head: true }),
    admin.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    admin.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'inactive'),
    admin.from('tenants').select('id', { count: 'exact', head: true }).eq('status', 'suspended'),
    admin.from('users').select('id', { count: 'exact', head: true }),
    admin.from('customers').select('id', { count: 'exact', head: true }),
    admin.from('tenants')
      .select('id, name, slug, subdomain, status, created_at, subscriptions(status, plan_id)')
      .order('created_at', { ascending: false }),
    admin.from('tenant_modules').select('tenant_id, module_key, enabled').eq('enabled', true),
  ])

  // Build module count per tenant
  const moduleCountMap: Record<string, number> = {}
  for (const m of (tenantModulesRaw ?? [])) {
    moduleCountMap[m.tenant_id] = (moduleCountMap[m.tenant_id] ?? 0) + 1
  }

  const tenants = (allTenants ?? []) as unknown as Array<{
    id: string; name: string; slug: string; subdomain: string | null
    status: string; created_at: string
    subscriptions: Array<{ status: string; plan_id: string | null }>
  }>

  const stats = [
    { label: 'Total Businesses', value: totalTenants ?? 0,    icon: Building2,   color: 'text-gold-400',    bg: 'bg-gold-500/8'    },
    { label: 'Active',           value: activeTenants ?? 0,   icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/8' },
    { label: 'Inactive',         value: inactiveTenants ?? 0, icon: XCircle,      color: 'text-white/40',    bg: 'bg-white/4'       },
    { label: 'Suspended',        value: suspendedTenants ?? 0,icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-500/8'   },
    { label: 'Staff Users',      value: totalUsers ?? 0,      icon: Users,        color: 'text-blue-400',    bg: 'bg-blue-500/8'    },
    { label: 'Customers',        value: totalCustomers ?? 0,  icon: TrendingUp,   color: 'text-purple-400',  bg: 'bg-purple-500/8'  },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
            <LiveBadge />
          </div>
          <p className="text-sm text-white/40">
            Owner &mdash; <span className="font-mono text-white/50">{email}</span>
          </p>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-xs font-semibold text-gold-400 border border-gold-500/30 bg-gold-500/8 rounded-xl px-4 py-2 hover:bg-gold-500/15 transition-colors"
        >
          <Shield className="h-3.5 w-3.5" />
          Platform Admin
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="rounded-2xl border border-surface-border bg-graphite-900/60 px-4 py-4"
          >
            <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
              <Icon className={`h-4 w-4 ${color}`} strokeWidth={1.75} />
            </div>
            <p className="text-2xl font-bold text-white leading-none mb-1">{value.toLocaleString()}</p>
            <p className="text-xs text-white/35 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Businesses table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest">
            All Businesses
          </h2>
          <Link
            href="/admin"
            className="text-xs text-gold-400/70 hover:text-gold-400 transition-colors"
          >
            Manage modules →
          </Link>
        </div>

        <div className="rounded-2xl border border-surface-border bg-graphite-900/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/6">
                  {['Business', 'Slug', 'Subscription', 'Modules', 'Joined', 'Status'].map((col) => (
                    <th
                      key={col}
                      className="text-left text-xs font-semibold text-white/25 uppercase tracking-widest px-5 py-3 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/4">
                {tenants.map((t) => {
                  const sub = t.subscriptions?.[0]
                  const moduleCount = moduleCountMap[t.id] ?? 0
                  return (
                    <tr key={t.id} className="hover:bg-white/[0.02] transition-colors duration-100 group">
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-gold-500/20 to-gold-600/10 border border-gold-500/20 flex items-center justify-center shrink-0">
                            <span className="text-gold-400 font-bold text-2xs">
                              {t.name.slice(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{t.name}</p>
                            {t.subdomain && (
                              <p className="text-2xs text-white/25">{t.subdomain}.apex.crm</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-white/40 font-mono text-xs whitespace-nowrap">
                        {t.slug}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {sub ? (
                          <span className={`text-xs px-2 py-0.5 rounded-lg border ${
                            sub.status === 'active'
                              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                              : 'bg-white/5 border-white/10 text-white/30'
                          }`}>
                            {sub.status}
                          </span>
                        ) : (
                          <span className="text-xs text-white/20">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        {moduleCount > 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
                            <Package className="h-3 w-3 text-white/25" />
                            {moduleCount}
                          </span>
                        ) : (
                          <span className="text-xs text-white/20">None</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-white/30 text-xs whitespace-nowrap">
                        {formatDate(t.created_at)}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <TenantStatusButton
                          tenantId={t.id}
                          currentStatus={t.status}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {tenants.length === 0 && (
              <div className="text-center py-16">
                <Building2 className="h-8 w-8 text-white/10 mx-auto mb-3" />
                <p className="text-white/25 text-sm">No businesses have signed up yet.</p>
              </div>
            )}
          </div>

          {tenants.length > 0 && (
            <div className="px-5 py-3 border-t border-white/6 flex items-center justify-between">
              <p className="text-xs text-white/25">
                {tenants.length} business{tenants.length !== 1 ? 'es' : ''} total
              </p>
              <Link
                href="/admin"
                className="text-xs text-gold-400/60 hover:text-gold-400 transition-colors flex items-center gap-1"
              >
                Full admin panel <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold text-white/30 uppercase tracking-widest">
          Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            {
              label: 'Module Control',
              desc: 'Enable or disable modules per business',
              href: '/admin',
              icon: Package,
              color: 'text-blue-400',
              bg: 'bg-blue-500/8',
              border: 'border-blue-500/15',
            },
            {
              label: 'All Tenants',
              desc: 'Browse and manage all registered businesses',
              href: '/tenants',
              icon: Building2,
              color: 'text-gold-400',
              bg: 'bg-gold-500/8',
              border: 'border-gold-500/15',
            },
            {
              label: 'Staff & Users',
              desc: 'View platform-wide staff accounts',
              href: '/tenants',
              icon: Users,
              color: 'text-purple-400',
              bg: 'bg-purple-500/8',
              border: 'border-purple-500/15',
            },
          ].map(({ label, desc, href, icon: Icon, color, bg, border }) => (
            <Link
              key={label}
              href={href}
              className={`group flex items-start gap-4 p-4 rounded-2xl border ${border} ${bg} hover:opacity-80 transition-opacity`}
            >
              <div className={`p-2.5 rounded-xl ${bg} border ${border} shrink-0`}>
                <Icon className={`h-4 w-4 ${color}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white mb-0.5">{label}</p>
                <p className="text-xs text-white/35 leading-relaxed">{desc}</p>
              </div>
              <ArrowRight className="h-4 w-4 text-white/15 group-hover:text-white/40 transition-colors shrink-0 mt-0.5 ml-auto" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
