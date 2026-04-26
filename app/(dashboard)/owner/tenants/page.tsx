export const dynamic = 'force-dynamic'

// app/(dashboard)/owner/tenants/page.tsx
import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getTenants }     from '@/lib/owner/getTenants'
import { TenantList }     from '@/components/owner/TenantList'
import { Building2, Shield } from 'lucide-react'

export const metadata = { title: 'Businesses — Owner Panel' }

export default async function OwnerTenantsPage() {
  // ── Owner guard ────────────────────────────────────────────────────────────
  const ctx = await getUserContext()

  if (!ctx)               redirect('/login')
  if (ctx.role !== 'owner') redirect('/dashboard?error=forbidden')

  // ── Data ───────────────────────────────────────────────────────────────────
  const tenants = await getTenants()

  const active    = tenants.filter((t) => t.status === 'active').length
  const inactive  = tenants.filter((t) => t.status !== 'active').length
  const totalMods = tenants.reduce((sum, t) => sum + t.enabled_modules, 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-gold-500/20 to-amber-600/10 border border-gold-500/20 flex items-center justify-center shrink-0">
          <Building2 className="h-5 w-5 text-gold-400" strokeWidth={1.75} />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-white">Business Management</h1>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gold-500/8 border border-gold-500/20">
              <Shield className="h-3 w-3 text-gold-400" strokeWidth={2} />
              <span className="text-2xs font-semibold text-gold-400 uppercase tracking-widest">
                Owner
              </span>
            </span>
          </div>
          <p className="text-sm text-white/40 max-w-xl leading-relaxed">
            Select a business to view details and configure which modules its
            admins can access.
          </p>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total',           value: tenants.length, color: 'text-gold-400',    bg: 'bg-gold-500/8'    },
          { label: 'Active',          value: active,          color: 'text-emerald-400', bg: 'bg-emerald-500/8' },
          { label: 'Inactive',        value: inactive,        color: 'text-white/30',    bg: 'bg-white/4'       },
          { label: 'Enabled Modules', value: totalMods,       color: 'text-blue-400',    bg: 'bg-blue-500/8'    },
        ].map(({ label, value, color, bg: _bg }) => (
          <div
            key={label}
            className="rounded-2xl border border-surface-border bg-graphite-900/60 px-5 py-4"
          >
            <p className={`text-2xl font-bold leading-none mb-1 ${color}`}>{value}</p>
            <p className="text-xs text-white/35 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Tenant grid */}
      {tenants.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-surface-border bg-graphite-900/40">
          <Building2 className="h-10 w-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No businesses registered yet.</p>
        </div>
      ) : (
        <TenantList tenants={tenants} />
      )}
    </div>
  )
}
