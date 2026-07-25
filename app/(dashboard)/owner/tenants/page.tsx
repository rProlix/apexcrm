export const dynamic = 'force-dynamic'

// app/(dashboard)/owner/tenants/page.tsx
import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getTenants } from '@/lib/owner/getTenants'
import { TenantList } from '@/components/owner/TenantList'
import { Building2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/StatePanel'

export const metadata = { title: 'Businesses — Owner Panel' }

export default async function OwnerTenantsPage() {
  // ── Owner guard ────────────────────────────────────────────────────────────
  const ctx = await getUserContext()

  if (!ctx) redirect('/login')
  if (ctx.role !== 'owner') redirect('/dashboard?error=forbidden')

  // ── Data ───────────────────────────────────────────────────────────────────
  const tenants = await getTenants()

  const active = tenants.filter((t) => t.status === 'active').length
  const inactive = tenants.filter((t) => t.status !== 'active').length
  const totalMods = tenants.reduce((sum, t) => sum + t.enabled_modules, 0)

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Owner workspace"
        title="Business management"
        description="Select a business to review its status, users, and module access."
        icon={Building2}
        meta={<StatusBadge status="active" label="Platform owner only" />}
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: tenants.length, color: 'text-gold-400', bg: 'bg-gold-500/8' },
          { label: 'Active', value: active, color: 'text-emerald-400', bg: 'bg-emerald-500/8' },
          { label: 'Inactive', value: inactive, color: 'text-white/30', bg: 'bg-white/4' },
          {
            label: 'Enabled Modules',
            value: totalMods,
            color: 'text-blue-400',
            bg: 'bg-blue-500/8',
          },
        ].map(({ label, value, color, bg: _bg }) => (
          <div key={label} className="ui-surface px-5 py-4">
            <p className={`text-2xl font-bold leading-none mb-1 ${color}`}>{value}</p>
            <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
          </div>
        ))}
      </div>

      {/* Tenant grid */}
      {tenants.length === 0 ? (
        <EmptyState
          title="No businesses yet"
          description="Businesses will appear here after onboarding."
          icon={Building2}
        />
      ) : (
        <TenantList tenants={tenants} />
      )}
    </div>
  )
}
