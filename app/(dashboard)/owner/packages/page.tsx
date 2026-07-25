import { Boxes } from 'lucide-react'
import { requireOwner } from '@/lib/auth/requireRole'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MODULE_REGISTRY } from '@/modules/registry'
import type { ModuleKey } from '@/modules/shared/moduleTypes'
import {
  listOwnerModulePackages,
  listRecentPackageApplications,
} from '@/lib/module-packages/service'
import { OwnerModulePackageManager } from '@/components/modules/OwnerModulePackageManager'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState } from '@/components/ui/StatePanel'
import { StatusBadge } from '@/components/ui/StatusBadge'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Module Packages — Owner' }

export default async function OwnerModulePackagesPage() {
  await requireOwner()
  const db = getSupabaseServerClient()
  const [{ data: tenants, error: tenantError }, packagesResult, applicationsResult] =
    await Promise.all([
      db.from('tenants').select('id, name, slug, status').order('name', { ascending: true }),
      settle(listOwnerModulePackages({ includeArchived: true })),
      settle(listRecentPackageApplications()),
    ])

  const loadFailed = Boolean(tenantError || packagesResult.error || applicationsResult.error)
  const modules = (Object.keys(MODULE_REGISTRY) as ModuleKey[])
    .map((key) => ({
      key,
      label: MODULE_REGISTRY[key].label,
      description: MODULE_REGISTRY[key].description,
      order: MODULE_REGISTRY[key].order,
    }))
    .sort((a, b) => a.order - b.order)

  return (
    <div className="ui-page">
      <PageHeader
        eyebrow="Commercial configuration"
        title="Module package manager"
        description="Build reusable product packages and activate the right business workflow in one controlled change."
        icon={Boxes}
        meta={<StatusBadge status="active" label="Platform owner only" />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Active packages"
          value={(packagesResult.data ?? []).filter((p) => p.status === 'active').length}
        />
        <Stat label="Businesses" value={(tenants ?? []).length} />
        <Stat label="Recent applications" value={(applicationsResult.data ?? []).length} />
      </div>

      {loadFailed ? (
        <ErrorState
          title="Package manager unavailable"
          description="Confirm the owner module package migration has been applied, then try again."
        />
      ) : (tenants ?? []).length === 0 ? (
        <EmptyState
          title="No businesses available"
          description="Create a business before applying module packages."
        />
      ) : (
        <OwnerModulePackageManager
          packages={packagesResult.data ?? []}
          tenants={tenants ?? []}
          modules={modules}
          applications={applicationsResult.data ?? []}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="ui-surface px-5 py-4">
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="mt-1 text-xs font-medium text-[var(--text-secondary)]">{label}</p>
    </div>
  )
}

async function settle<T>(promise: Promise<T>): Promise<{ data: T | null; error: boolean }> {
  try {
    return { data: await promise, error: false }
  } catch {
    return { data: null, error: true }
  }
}
