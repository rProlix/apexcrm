export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ArrowLeft, Wrench } from 'lucide-react'
import { requirePermission } from '@/lib/auth/requirePermission'
import { guardModuleAccess } from '@/lib/modules/guardModuleAccess'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { MaintenanceWorkspace } from '@/components/maintenance/MaintenanceWorkspace'
import type { MaintenanceItem } from '@/lib/maintenance/types'

export const metadata = { title: 'Fleet Maintenance' }

function record(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

export default async function FleetMaintenancePage() {
  const ctx = await requirePermission('use_modules')
  const tenantId = ctx.tenant_id!
  await guardModuleAccess(tenantId, 'vehicles', ctx.role)
  const db = getSupabaseServerClient()
  const [itemsResult, vehiclesResult, usersResult, attachmentResult] = await Promise.all([
    db
      .from('fleet_maintenance_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('business_id', tenantId)
      .order('latest_activity_at', { ascending: false })
      .limit(750),
    db
      .from('vehicles')
      .select('id,name,van_number,status')
      .eq('tenant_id', tenantId)
      .order('van_number'),
    db
      .from('users')
      .select('id,email,metadata')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('email'),
    db
      .from('fleet_maintenance_attachments')
      .select('maintenance_item_id')
      .eq('tenant_id', tenantId)
      .eq('business_id', tenantId)
      .eq('status', 'uploaded'),
  ])
  const attachmentCounts = new Map<string, number>()
  for (const row of attachmentResult.data ?? []) {
    attachmentCounts.set(
      row.maintenance_item_id,
      (attachmentCounts.get(row.maintenance_item_id) ?? 0) + 1
    )
  }
  const vehicleMap = new Map((vehiclesResult.data ?? []).map((vehicle) => [vehicle.id, vehicle]))
  const items = (itemsResult.data ?? []).map((item) => ({
    ...item,
    reporter_snapshot: record(item.reporter_snapshot),
    metadata: record(item.metadata),
    attachment_count: attachmentCounts.get(item.id) ?? 0,
    van: item.van_id ? (vehicleMap.get(item.van_id) ?? null) : null,
  })) as unknown as MaintenanceItem[]

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/vehicles"
            className="text-xs text-white/40 transition hover:text-white/70"
          >
            <ArrowLeft className="mr-1 inline h-3.5 w-3.5" />
            Fleet
          </Link>
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-xl bg-amber-400/10 p-2.5 text-amber-200">
              <Wrench className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-white">Fleet Maintenance</h1>
              <p className="mt-1 text-sm text-white/40">
                Prioritized reports, repair workflow, notes, and service history.
              </p>
            </div>
          </div>
        </div>
      </header>
      {itemsResult.error ? (
        <div role="alert" className="rounded-xl border border-red-400/20 bg-red-400/10 p-5">
          <p className="text-sm font-medium text-red-100">We couldn’t load fleet maintenance.</p>
          <p className="mt-1 text-xs text-red-100/65">
            Refresh the page to try again. If the problem continues, contact your platform owner.
          </p>
        </div>
      ) : (
        <MaintenanceWorkspace
          businessId={tenantId}
          canManage={['owner', 'admin'].includes(ctx.role)}
          initialItems={items}
          vehicles={vehiclesResult.data ?? []}
          users={(usersResult.data ?? []).map((user) => ({
            id: user.id,
            email: user.email,
            full_name:
              typeof record(user.metadata).fullName === 'string'
                ? String(record(user.metadata).fullName)
                : null,
          }))}
        />
      )}
    </div>
  )
}
