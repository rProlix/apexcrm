// app/(dashboard)/owner/modules/page.tsx
import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTenantModules } from '@/lib/modules/getTenantModules'
import { TenantModuleManager } from '@/components/modules/TenantModuleManager'
import { Shield, Layers } from 'lucide-react'

export const metadata = { title: 'Module Access Control — Owner' }

interface TenantRow {
  id:         string
  name:       string
  slug:       string
  status:     string
  created_at: string
}

export default async function OwnerModulesPage() {
  // ── Auth: owner only ───────────────────────────────────────────────────────
  const ctx = await getUserContext()

  if (!ctx) {
    redirect('/login')
  }

  if (ctx.role !== 'owner') {
    redirect('/dashboard?error=forbidden')
  }

  // ── Fetch all tenants ──────────────────────────────────────────────────────
  const supabase = getSupabaseServerClient()

  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, slug, status, created_at')
    .order('name', { ascending: true })

  if (tenantErr) {
    console.error('[OwnerModulesPage] tenant fetch error:', tenantErr.message)
  }

  const tenantList = (tenants ?? []) as TenantRow[]

  // ── Fetch module states for all tenants in parallel ───────────────────────
  const moduleMaps = await Promise.all(
    tenantList.map(async (t) => ({
      tenantId: t.id,
      modules:  await getTenantModules(t.id),
    }))
  )

  const modulesByTenant = Object.fromEntries(
    moduleMaps.map(({ tenantId, modules }) => [tenantId, modules])
  )

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start gap-4">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-gold-500/20 to-amber-600/10 border border-gold-500/20 flex items-center justify-center shrink-0">
          <Layers className="h-5 w-5 text-gold-400" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">Module Access Control</h1>
          <p className="text-sm text-white/40 max-w-xl leading-relaxed">
            Enable or disable modules for each business. Changes take effect immediately —
            admins lose access to disabled modules instantly across UI and API.
          </p>
        </div>
      </div>

      {/* Owner badge */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gold-500/8 border border-gold-500/20">
        <Shield className="h-3.5 w-3.5 text-gold-400" strokeWidth={2} />
        <span className="text-xs font-semibold text-gold-400 uppercase tracking-widest">
          Platform Owner
        </span>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Businesses',  value: tenantList.length },
          { label: 'Active Businesses', value: tenantList.filter((t) => t.status === 'active').length },
          { label: 'Total Module Slots', value: tenantList.length * Object.keys(modulesByTenant[tenantList[0]?.id ?? ''] ?? {}).length },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="rounded-2xl border border-surface-border bg-graphite-900/60 px-5 py-4"
          >
            <p className="text-2xl font-bold text-white leading-none mb-1">{value}</p>
            <p className="text-xs text-white/35 font-medium">{label}</p>
          </div>
        ))}
      </div>

      {/* Main module manager */}
      {tenantList.length === 0 ? (
        <div className="text-center py-20 rounded-2xl border border-surface-border bg-graphite-900/40">
          <Layers className="h-10 w-10 text-white/10 mx-auto mb-3" />
          <p className="text-white/30 text-sm">No businesses registered yet.</p>
        </div>
      ) : (
        <TenantModuleManager
          tenants={tenantList}
          modulesByTenant={modulesByTenant}
        />
      )}
    </div>
  )
}
