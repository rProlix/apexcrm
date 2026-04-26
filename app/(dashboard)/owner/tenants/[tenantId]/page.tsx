export const dynamic = 'force-dynamic'

// app/(dashboard)/owner/tenants/[tenantId]/page.tsx
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getTenantById }  from '@/lib/owner/getTenants'
import { getTenantModulesWithDefaults } from '@/lib/modules/getTenantModulesWithDefaults'
import { TenantModuleManager } from '@/components/owner/TenantModuleManager'
import {
  ArrowLeft, Globe, Calendar,
  CheckCircle2, XCircle, Users, Layers,
} from 'lucide-react'
import { formatDate } from '@/lib/utils'

export const metadata = { title: 'Tenant Detail — Owner Panel' }

type PageProps = { params: Promise<{ tenantId: string }> }

export default async function TenantDetailPage({ params }: PageProps) {
  const { tenantId } = await params
  // ── Owner guard ────────────────────────────────────────────────────────────
  const ctx = await getUserContext()

  if (!ctx)               redirect('/login')
  if (ctx.role !== 'owner') redirect('/dashboard?error=forbidden')

  // ── Data ───────────────────────────────────────────────────────────────────
  const [tenant, modules] = await Promise.all([
    getTenantById(tenantId),
    getTenantModulesWithDefaults(tenantId),
  ])

  if (!tenant) notFound()

  const domain = tenant.custom_domain ?? tenant.subdomain ?? `${tenant.slug}.yourcrm.com`
  const isActive = tenant.status === 'active'

  return (
    <div className="space-y-8">
      {/* Back navigation */}
      <Link
        href="/owner/tenants"
        className="inline-flex items-center gap-2 text-sm text-white/40 hover:text-white transition-colors duration-150"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
        All Businesses
      </Link>

      {/* Tenant header */}
      <div className="rounded-2xl border border-surface-border bg-graphite-900/70 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-white/6">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-gold-500/20 to-amber-600/10 border border-gold-500/20 flex items-center justify-center shrink-0">
              <span className="text-gold-400 font-bold text-base">
                {tenant.name.slice(0, 2).toUpperCase()}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-0.5">
                {isActive
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" strokeWidth={2} />
                  : <XCircle      className="h-4 w-4 text-white/25"     strokeWidth={1.75} />
                }
                <h1 className="text-xl font-bold text-white">{tenant.name}</h1>
              </div>
              <p className="text-sm text-white/35 font-mono">{tenant.slug}</p>
            </div>
          </div>

          <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl border ${
            isActive
              ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400'
              : 'bg-white/5 border-white/10 text-white/30'
          }`}>
            {tenant.status}
          </span>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-white/5">
          {[
            {
              icon: Globe,
              label: 'Domain',
              value: domain,
              mono: true,
            },
            {
              icon: Calendar,
              label: 'Joined',
              value: formatDate(tenant.created_at),
              mono: false,
            },
            {
              icon: Users,
              label: 'Staff',
              value: `${tenant.staff_count} user${tenant.staff_count !== 1 ? 's' : ''}`,
              mono: false,
            },
            {
              icon: Layers,
              label: 'Active Modules',
              value: `${tenant.enabled_modules} enabled`,
              mono: false,
            },
          ].map(({ icon: Icon, label, value, mono }) => (
            <div key={label} className="px-5 py-4">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="h-3.5 w-3.5 text-white/20" strokeWidth={1.75} />
                <span className="text-2xs font-semibold text-white/25 uppercase tracking-widest">
                  {label}
                </span>
              </div>
              <p className={`text-sm text-white/70 truncate ${mono ? 'font-mono' : ''}`}>
                {value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Module management section */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-8 w-8 rounded-xl bg-gold-500/8 border border-gold-500/15 flex items-center justify-center">
            <Layers className="h-4 w-4 text-gold-400" strokeWidth={1.75} />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Module Access</h2>
            <p className="text-xs text-white/35">
              Toggle which features admins of <span className="text-white/55">{tenant.name}</span> can access
            </p>
          </div>
        </div>

        <TenantModuleManager
          tenantId={tenant.id}
          tenantName={tenant.name}
          initialModules={modules}
        />
      </div>
    </div>
  )
}
