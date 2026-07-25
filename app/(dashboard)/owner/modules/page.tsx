export const dynamic = 'force-dynamic'

// app/(dashboard)/owner/modules/page.tsx
import { redirect } from 'next/navigation'
import { getUserContext } from '@/lib/auth/getUserContext'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { getTenantModules } from '@/lib/modules/getTenantModules'
import { TenantModuleManager } from '@/components/modules/TenantModuleManager'
import { Layers } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/ui/StatePanel'

export const metadata = { title: 'Module Access Control — Owner' }

interface TenantRow {
  id: string
  name: string
  slug: string
  status: string
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
      modules: await getTenantModules(t.id),
    }))
  )

  const modulesByTenant = Object.fromEntries(
    moduleMaps.map(({ tenantId, modules }) => [tenantId, modules])
  )

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Commercial configuration"
        title="Module access control"
        description="Enable or disable modules for each business. Changes take effect immediately across navigation and server-side access gates."
        icon={Layers}
        meta={<StatusBadge status="active" label="Platform owner only" />}
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Total Businesses', value: tenantList.length },
          {
            label: 'Active Businesses',
            value: tenantList.filter((t) => t.status === 'active').length,
          },
          {
            label: 'Total Module Slots',
            value:
              tenantList.length *
              Object.keys(modulesByTenant[tenantList[0]?.id ?? ''] ?? {}).length,
          },
        ].map(({ label, value }) => (
          <div key={label} className="ui-surface px-5 py-4">
            <p className="mb-1 text-2xl font-bold leading-none tabular-nums text-white">{value}</p>
            <p className="text-xs font-medium text-[var(--text-secondary)]">{label}</p>
          </div>
        ))}
      </div>

      {/* Main module manager */}
      {tenantList.length === 0 ? (
        <EmptyState
          title="No businesses yet"
          description="Businesses will appear here after onboarding."
          icon={Layers}
        />
      ) : (
        <TenantModuleManager tenants={tenantList} modulesByTenant={modulesByTenant} />
      )}
    </div>
  )
}
