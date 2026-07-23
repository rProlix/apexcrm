'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Car,
  CheckCircle2,
  Eye,
  History,
  ImageIcon,
  ShieldAlert,
  UserRound,
  Wrench,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { formatDriverName } from '@/lib/van-damage/history'
import { formatInspectionTimestamp } from '@/lib/van-damage/inspection-period'
import { SignedDamageImage } from './SignedDamageImage'
import { StatusBadge } from './StatusBadge'
import { InspectionPeriodBadge } from './InspectionPeriodBadge'

type JsonRecord = Record<string, unknown>

export type FleetVehicleRow = {
  id: string
  name: string
  van_number: string | null
  make: string | null
  model: string | null
  year: number | null
  plate_number: string | null
  status: string
  metadata: JsonRecord
}

export type FleetAttentionRow = {
  tenant_id: string
  business_id: string
  van_id: string
  van_number: string | null
  vehicle_name: string
  make: string | null
  model: string | null
  vehicle_year: number | null
  plate_number: string | null
  operational_status: string
  vehicle_metadata: JsonRecord
  profile_image_id: string | null
  attention_alert_id: string
  acknowledged_by: string | null
  acknowledged_by_name: string | null
  acknowledged_at: string | null
  first_triggered_at: string
  last_observed_at: string
  highest_severity: string
  severe_source_count: number
  active_severe_case_count: number
  total_active_damage_case_count: number
  needs_review_count: number
  observation_count: number
  suppressed_duplicate_count: number
  latest_damage_case_id: string | null
  latest_inspection_id: string
  latest_evidence_image_id: string | null
  latest_damage_area: string | null
  latest_damage_type: string | null
  latest_driver: JsonRecord
  latest_upload_at: string | null
  latest_image_count: number
  repair_status: string
  recurrent: boolean
  first_reporter: JsonRecord
  first_inspection_id: string | null
  first_upload_session_id: string | null
  first_evidence_image_id: string | null
  first_source_timestamp: string | null
  first_source_timestamp_kind: string | null
  latest_uploader: JsonRecord
}

export type FleetMaintenanceSummary = {
  vanId: string
  activeCount: number
  urgentCount: number
  highCount: number
  quickFixCount: number
  appointmentCount: number
  needsAttention: boolean
  topItems: Array<{ id: string; title: string; priority: string; status: string }>
}

type AttentionFilter = 'all' | 'unacknowledged' | 'needs_review' | 'repair_scheduled' | 'in_repair'
type AttentionSort = 'priority' | 'oldest' | 'recent'

export function FleetNeedsAttentionBoard({
  tenantId,
  timeZone,
  canManage,
  vehicles,
  attention,
  maintenance,
  attentionError,
}: {
  tenantId: string
  timeZone: string
  canManage: boolean
  vehicles: FleetVehicleRow[]
  attention: FleetAttentionRow[]
  maintenance: FleetMaintenanceSummary[]
  attentionError: string | null
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<AttentionFilter>('all')
  const [sort, setSort] = useState<AttentionSort>('priority')
  const [pending, startTransition] = useTransition()
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let refreshTimer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => startTransition(() => router.refresh()), 250)
    }
    const channel = supabase
      .channel(`fleet-attention-${tenantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'van_damage_attention_alerts',
          filter: `tenant_id=eq.${tenantId}`,
        },
        refresh
      )
      .subscribe()
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer)
      void supabase.removeChannel(channel)
    }
  }, [router, tenantId])

  const uniqueAttention = useMemo(() => {
    const unique = new Map<string, FleetAttentionRow>()
    for (const item of attention) {
      const key = `${item.tenant_id}:${item.van_id}`
      const current = unique.get(key)
      if (!current || item.last_observed_at > current.last_observed_at) unique.set(key, item)
    }
    return [...unique.values()]
  }, [attention])
  const maintenanceByVan = useMemo(
    () => new Map(maintenance.map((item) => [item.vanId, item])),
    [maintenance]
  )
  const maintenanceAttention = maintenance.filter((item) => item.needsAttention)

  const displayedAttention = useMemo(() => {
    const filtered = uniqueAttention.filter((item) => {
      if (filter === 'unacknowledged') return !item.acknowledged_at
      if (filter === 'needs_review') return item.needs_review_count > 0
      if (filter === 'repair_scheduled') return item.repair_status === 'repair_scheduled'
      if (filter === 'in_repair') return item.repair_status === 'in_repair'
      return true
    })
    return filtered.sort((a, b) => {
      if (sort === 'oldest') return a.first_triggered_at.localeCompare(b.first_triggered_at)
      if (sort === 'recent') return b.last_observed_at.localeCompare(a.last_observed_at)
      const severity = severityLevel(b.highest_severity) - severityLevel(a.highest_severity)
      if (severity) return severity
      if (Boolean(a.acknowledged_at) !== Boolean(b.acknowledged_at))
        return a.acknowledged_at ? 1 : -1
      return a.first_triggered_at.localeCompare(b.first_triggered_at)
    })
  }, [filter, sort, uniqueAttention])

  const attentionVanIds = new Set([
    ...uniqueAttention.map((item) => item.van_id),
    ...maintenanceAttention.map((item) => item.vanId),
  ])
  const maintenanceOnlyAttention = maintenanceAttention.filter(
    (item) => !uniqueAttention.some((damage) => damage.van_id === item.vanId)
  )
  const activeVehicles = vehicles.filter(
    (vehicle) => vehicle.status === 'active' && !attentionVanIds.has(vehicle.id)
  )
  const inServiceVehicles = vehicles.filter(
    (vehicle) => vehicle.status !== 'active' && !attentionVanIds.has(vehicle.id)
  )

  async function runAction(
    item: FleetAttentionRow,
    action: 'acknowledge' | 'repair_scheduled' | 'in_repair' | 'repaired'
  ) {
    if (
      action === 'repaired' &&
      !window.confirm(
        `Mark every active severe-damage case for ${item.van_number ? `Van ${item.van_number}` : item.vehicle_name} repaired?`
      )
    )
      return
    setActionError(null)
    const response = await fetch(
      `/api/van-damage/attention/${item.attention_alert_id}?businessId=${encodeURIComponent(tenantId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }
    )
    if (!response.ok) {
      const body = (await response
        .json()
        .catch(() => ({ error: 'Unable to update Fleet attention' }))) as { error?: string }
      setActionError(body.error ?? 'Unable to update Fleet attention')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <div className="space-y-6" aria-busy={pending}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <FleetMetric
          label="Total vans"
          value={vehicles.length}
          icon={Car}
          tone="text-indigo-300 bg-indigo-400/10"
        />
        <FleetMetric
          label="Available"
          value={activeVehicles.length}
          icon={CheckCircle2}
          tone="text-emerald-300 bg-emerald-400/10"
        />
        <FleetMetric
          label="In service"
          value={inServiceVehicles.length}
          icon={Wrench}
          tone="text-amber-300 bg-amber-400/10"
        />
        <FleetMetric
          label="Needs Attention"
          value={attentionVanIds.size}
          icon={AlertTriangle}
          tone="text-red-200 bg-red-400/10"
        />
      </div>

      <section
        className="rounded-2xl border border-red-400/15 bg-[linear-gradient(145deg,rgba(127,29,29,.12),rgba(20,20,22,1)_40%)] p-4 md:p-6"
        aria-labelledby="needs-attention-heading"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[.18em] text-red-200/65">
              Fleet safety overlay
            </p>
            <h2 id="needs-attention-heading" className="mt-1 text-xl font-semibold text-white">
              Needs Attention{' '}
              <span className="text-white/35">({attentionVanIds.size} unique vans)</span>
            </h2>
            <p className="mt-1 text-xs text-white/40">
              Active Level 3 damage and qualifying urgent, out-of-service, or overdue maintenance.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as AttentionFilter)}
              aria-label="Filter Needs Attention vans"
              className="focus-ring rounded-xl border border-white/10 bg-graphite-900 px-3 py-2 text-xs text-white/65"
            >
              <option value="all">All severe vans</option>
              <option value="unacknowledged">Unacknowledged</option>
              <option value="needs_review">Needs review</option>
              <option value="repair_scheduled">Repair scheduled</option>
              <option value="in_repair">In repair</option>
            </select>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as AttentionSort)}
              aria-label="Sort Needs Attention vans"
              className="focus-ring rounded-xl border border-white/10 bg-graphite-900 px-3 py-2 text-xs text-white/65"
            >
              <option value="priority">Priority</option>
              <option value="oldest">Oldest unresolved</option>
              <option value="recent">Recently observed</option>
            </select>
          </div>
        </div>

        {(attentionError || actionError) && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100"
          >
            {actionError || attentionError}
          </div>
        )}
        {!attentionError && !displayedAttention.length && !maintenanceOnlyAttention.length && (
          <div className="mt-5 rounded-xl border border-dashed border-white/10 p-10 text-center">
            <ShieldAlert className="mx-auto h-9 w-9 text-emerald-300/50" />
            <p className="mt-3 text-sm text-white/55">
              {uniqueAttention.length
                ? 'No vans match this attention filter.'
                : 'No vans currently have severe damage or qualifying maintenance attention.'}
            </p>
          </div>
        )}
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {displayedAttention.map((item) => (
            <SevereVanCard
              key={`${item.tenant_id}:${item.van_id}`}
              item={item}
              businessId={tenantId}
              timeZone={timeZone}
              canManage={canManage}
              pending={pending}
              runAction={runAction}
              maintenance={maintenanceByVan.get(item.van_id)}
            />
          ))}
          {maintenanceOnlyAttention.map((summary) => {
            const vehicle = vehicles.find((candidate) => candidate.id === summary.vanId)
            return vehicle ? (
              <MaintenanceAttentionCard
                key={summary.vanId}
                vehicle={vehicle}
                summary={summary}
                businessId={tenantId}
              />
            ) : null
          })}
        </div>
        {uniqueAttention.length > 0 && (
          <p className="mt-4 text-xs text-white/30">
            Reporter information identifies who submitted the inspection images and does not
            determine who caused the damage.
          </p>
        )}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <FleetColumn
          title="Available"
          description="Operationally active vans without an active severe-damage overlay."
          vehicles={activeVehicles}
          businessId={tenantId}
          empty="No available vans."
          maintenanceByVan={maintenanceByVan}
        />
        <FleetColumn
          title="In service / other"
          description="Operational states remain independent from damage attention."
          vehicles={inServiceVehicles}
          businessId={tenantId}
          empty="No vans currently in another operational state."
          maintenanceByVan={maintenanceByVan}
        />
      </section>
    </div>
  )
}

function SevereVanCard({
  item,
  businessId,
  timeZone,
  canManage,
  pending,
  runAction,
  maintenance,
}: {
  item: FleetAttentionRow
  businessId: string
  timeZone: string
  canManage: boolean
  pending: boolean
  runAction: (
    item: FleetAttentionRow,
    action: 'acknowledge' | 'repair_scheduled' | 'in_repair' | 'repaired'
  ) => Promise<void>
  maintenance?: FleetMaintenanceSummary
}) {
  const imageId = item.profile_image_id || item.latest_evidence_image_id
  const driver = formatDriverName(item.latest_driver)
  const firstReporter = formatDriverName(item.first_reporter)
  const latestUploader = formatDriverName(item.latest_uploader)
  const severeLabel =
    severityLevel(item.highest_severity) >= 4 ? 'Critical damage' : 'Level 3 severe damage'
  return (
    <article
      className="overflow-hidden rounded-2xl border border-red-400/15 bg-graphite-900"
      aria-label={`${item.van_number ? `Van ${item.van_number}` : item.vehicle_name}, ${severeLabel}`}
    >
      <div className="grid sm:grid-cols-[180px_1fr]">
        <div className="bg-black/20 p-3">
          {imageId ? (
            <SignedDamageImage
              imageId={imageId}
              businessId={businessId}
              alt={`${item.vehicle_name} profile or damage evidence`}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-xl border border-white/10 text-white/25">
              <ImageIcon className="h-7 w-7" />
            </div>
          )}
          <p className="mt-2 text-[10px] text-white/30">
            {item.profile_image_id
              ? 'Fleet profile image'
              : item.latest_evidence_image_id
                ? 'Latest damage evidence'
                : 'No image available'}
          </p>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[.16em] text-red-200/65">{severeLabel}</p>
              <h3 className="mt-1 text-lg font-semibold text-white">
                {item.van_number ? `Van ${item.van_number}` : item.vehicle_name}
              </h3>
              <p className="mt-1 text-xs text-white/35">
                {[item.vehicle_year, item.make, item.model].filter(Boolean).join(' ') ||
                  item.plate_number ||
                  'Vehicle details unavailable'}
              </p>
            </div>
            <StatusBadge status={item.operational_status} />
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
            <AttentionBadge
              label={`${item.severe_source_count} active severe ${item.severe_source_count === 1 ? 'case/finding' : 'cases/findings'}`}
              urgent
            />
            <AttentionBadge label={`${item.total_active_damage_case_count} total active damage`} />
            {item.needs_review_count > 0 && (
              <AttentionBadge label={`${item.needs_review_count} needs review`} />
            )}
            {item.recurrent && <AttentionBadge label="Recurrence" />}
            {item.suppressed_duplicate_count > 0 && <AttentionBadge label="Observed again" />}
            {item.repair_status !== 'active' && (
              <AttentionBadge label={humanize(item.repair_status)} />
            )}
            {maintenance?.activeCount ? (
              <AttentionBadge label={`${maintenance.activeCount} active maintenance`} />
            ) : null}
            {maintenance?.urgentCount ? (
              <AttentionBadge label={`${maintenance.urgentCount} urgent maintenance`} urgent />
            ) : null}
          </div>
          <dl className="mt-4 grid gap-2 text-xs text-white/40 sm:grid-cols-2">
            <Detail
              icon={AlertTriangle}
              label="Latest area"
              value={humanize(item.latest_damage_area || 'unspecified')}
            />
            <Detail icon={History} label="Observations" value={String(item.observation_count)} />
            <Detail
              icon={CalendarClock}
              label="First detected"
              value={formatDate(item.first_source_timestamp || item.first_triggered_at, timeZone)}
            />
            <Detail icon={UserRound} label="First reporter" value={firstReporter} />
            <Detail
              icon={Eye}
              label="Last observed"
              value={formatDate(item.last_observed_at, timeZone)}
            />
            <Detail icon={UserRound} label="Latest uploader" value={driver} />
            <Detail
              icon={ImageIcon}
              label="Latest upload"
              value={`${formatDate(item.latest_upload_at, timeZone)} · ${item.latest_image_count} image${item.latest_image_count === 1 ? '' : 's'}`}
            />
          </dl>
          <div className="mt-3 rounded-xl border border-red-300/10 bg-red-300/[.035] p-3 text-xs text-white/40">
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {item.first_inspection_id ? (
                <Link
                  href={`/dashboard/damage-ai/inspections/${item.first_inspection_id}?businessId=${encodeURIComponent(businessId)}`}
                  className="text-red-100/70 underline underline-offset-2"
                >
                  Original inspection
                </Link>
              ) : (
                <span>Original inspection unavailable</span>
              )}
              {item.first_upload_session_id ? (
                <span>Session {item.first_upload_session_id.slice(0, 8)}</span>
              ) : null}
              {item.first_evidence_image_id ? (
                <span>Evidence {item.first_evidence_image_id.slice(0, 8)}</span>
              ) : null}
            </div>
            {latestUploader !== firstReporter ? (
              <p className="mt-1">Latest uploader: {latestUploader}</p>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <InspectionPeriodBadge
              timestamp={item.latest_upload_at || item.last_observed_at}
              timeZone={timeZone}
              showLabel
            />
          </div>
          {item.acknowledged_at ? (
            <p className="mt-4 text-xs text-emerald-200/65">
              Acknowledged by {item.acknowledged_by_name || 'a team member'} ·{' '}
              {formatDate(item.acknowledged_at, timeZone)}
            </p>
          ) : (
            <p className="mt-4 text-xs text-amber-200/65">Unacknowledged severe-damage alert</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-4 py-3">
        <Link
          href={`/dashboard/vehicles/${item.van_id}?businessId=${encodeURIComponent(businessId)}`}
          className="focus-ring rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
        >
          Van profile
        </Link>
        <Link
          href={`/dashboard/damage-ai/inspections/${item.latest_inspection_id}?businessId=${encodeURIComponent(businessId)}`}
          className="focus-ring rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
        >
          Latest inspection
        </Link>
        {item.latest_damage_case_id && (
          <Link
            href={`/dashboard/vehicles/${item.van_id}?businessId=${encodeURIComponent(businessId)}#damage-case-${item.latest_damage_case_id}`}
            className="focus-ring rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5"
          >
            Damage history
          </Link>
        )}
        {maintenance?.activeCount ? (
          <Link
            href={`/dashboard/vehicles/maintenance?businessId=${encodeURIComponent(businessId)}&vanId=${item.van_id}`}
            className="focus-ring rounded-lg border border-amber-300/15 px-3 py-2 text-xs text-amber-100/70 hover:bg-amber-300/5"
          >
            Maintenance ({maintenance.activeCount})
          </Link>
        ) : null}
        {canManage && !item.acknowledged_at && (
          <button
            disabled={pending}
            onClick={() => runAction(item, 'acknowledge')}
            className="focus-ring rounded-lg bg-white px-3 py-2 text-xs font-medium text-graphite-950 disabled:opacity-50"
          >
            Acknowledge
          </button>
        )}
        {canManage && item.active_severe_case_count > 0 && (
          <select
            disabled={pending}
            value=""
            onChange={(event) => {
              const action = event.target.value as 'repair_scheduled' | 'in_repair' | 'repaired'
              if (action) void runAction(item, action)
            }}
            aria-label={`Update repair state for ${item.van_number ? `Van ${item.van_number}` : item.vehicle_name}`}
            className="focus-ring ml-auto rounded-lg border border-white/10 bg-graphite-800 px-3 py-2 text-xs text-white/60"
          >
            <option value="">Repair action…</option>
            <option value="repair_scheduled">Schedule repair</option>
            <option value="in_repair">Mark in repair</option>
            <option value="repaired">Mark all severe cases repaired</option>
          </select>
        )}
      </div>
    </article>
  )
}

function FleetColumn({
  title,
  description,
  vehicles,
  businessId,
  empty,
  maintenanceByVan,
}: {
  title: string
  description: string
  vehicles: FleetVehicleRow[]
  businessId: string
  empty: string
  maintenanceByVan: Map<string, FleetMaintenanceSummary>
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-graphite-800 p-5">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="font-semibold text-white">{title}</h2>
          <p className="mt-1 text-xs text-white/35">{description}</p>
        </div>
        <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-white/45">
          {vehicles.length}
        </span>
      </div>
      {vehicles.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {vehicles.map((vehicle) => (
            <Link
              key={vehicle.id}
              href={`/dashboard/vehicles/${vehicle.id}?businessId=${encodeURIComponent(businessId)}`}
              className="focus-ring group rounded-xl border border-white/8 bg-white/[.02] p-4 transition hover:border-gold-400/25 hover:bg-white/[.04]"
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[.14em] text-white/30">
                    {vehicle.van_number ? `Van ${vehicle.van_number}` : 'Vehicle'}
                  </p>
                  <h3 className="mt-2 font-medium text-white/75">{vehicle.name}</h3>
                  <p className="mt-1 text-xs text-white/35">
                    {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
                      vehicle.plate_number ||
                      'Details unavailable'}
                  </p>
                  {(maintenanceByVan.get(vehicle.id)?.activeCount ?? 0) > 0 ? (
                    <p className="mt-2 text-[11px] text-amber-100/60">
                      {maintenanceByVan.get(vehicle.id)?.activeCount} active maintenance ·{' '}
                      {maintenanceByVan.get(vehicle.id)?.quickFixCount} quick fixes
                    </p>
                  ) : null}
                </div>
                <ArrowRight className="h-4 w-4 text-white/25 transition group-hover:translate-x-1 group-hover:text-gold-300" />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/30">
          {empty}
        </p>
      )}
    </section>
  )
}

function MaintenanceAttentionCard({
  vehicle,
  summary,
  businessId,
}: {
  vehicle: FleetVehicleRow
  summary: FleetMaintenanceSummary
  businessId: string
}) {
  return (
    <article className="rounded-2xl border border-amber-400/20 bg-graphite-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[.16em] text-amber-200/65">
            Maintenance attention
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {vehicle.van_number ? `Van ${vehicle.van_number}` : vehicle.name}
          </h3>
          <p className="mt-1 text-xs text-white/35">
            {summary.activeCount} active item{summary.activeCount === 1 ? '' : 's'}
          </p>
        </div>
        <Wrench className="h-5 w-5 text-amber-200" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2 text-[10px]">
        {summary.urgentCount ? (
          <AttentionBadge label={`${summary.urgentCount} urgent`} urgent />
        ) : null}
        {summary.highCount ? <AttentionBadge label={`${summary.highCount} high priority`} /> : null}
        {summary.quickFixCount ? (
          <AttentionBadge label={`${summary.quickFixCount} quick fix`} />
        ) : null}
        {summary.appointmentCount ? (
          <AttentionBadge label={`${summary.appointmentCount} appointment`} />
        ) : null}
      </div>
      <ul className="mt-4 space-y-2">
        {summary.topItems.map((item) => (
          <li key={item.id} className="truncate text-sm text-white/55">
            {item.title}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex gap-2">
        <Link
          href={`/dashboard/vehicles/${vehicle.id}?businessId=${encodeURIComponent(businessId)}`}
          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60"
        >
          Van profile
        </Link>
        <Link
          href={`/dashboard/vehicles/maintenance?businessId=${encodeURIComponent(businessId)}&vanId=${vehicle.id}`}
          className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-medium text-graphite-950"
        >
          Open maintenance
        </Link>
      </div>
    </article>
  )
}

function FleetMetric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string
  value: number
  icon: typeof Car
  tone: string
}) {
  const [text, background] = tone.split(' ')
  return (
    <div className="rounded-xl border border-graphite-600 bg-graphite-800 p-4">
      <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${background}`}>
        <Icon className={`h-4 w-4 ${text}`} />
      </div>
      <p className="mt-3 text-2xl font-bold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-white/40">{label}</p>
    </div>
  )
}

function Detail({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof AlertTriangle
  label: string
  value: string
}) {
  return (
    <div className="flex min-w-0 items-start gap-2">
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/25" />
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-wider text-white/25">{label}</dt>
        <dd className="mt-0.5 truncate text-white/50" title={value}>
          {value}
        </dd>
      </div>
    </div>
  )
}

function AttentionBadge({ label, urgent = false }: { label: string; urgent?: boolean }) {
  return (
    <span
      className={`rounded-full border px-2.5 py-1 ${urgent ? 'border-red-400/20 bg-red-400/10 text-red-100' : 'border-white/10 bg-white/[.04] text-white/45'}`}
    >
      {label}
    </span>
  )
}

function severityLevel(value: string) {
  if (value === 'critical') return 4
  return 3
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase())
}

function formatDate(value: string | null | undefined, timeZone: string) {
  return formatInspectionTimestamp(value, { timeZone, fallback: 'Unknown' })
}
