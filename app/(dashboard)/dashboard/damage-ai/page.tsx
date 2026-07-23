export const dynamic = 'force-dynamic'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, FileSearch, MessageSquare, Settings } from 'lucide-react'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { getVanDamageConfigPresence } from '@/lib/server/env'
import { loadActiveSlackIntegration, publicIntegration } from '@/lib/server/slack/integration'
import { StatusBadge } from '@/components/van-damage/StatusBadge'
import { InspectionPeriodBadge } from '@/components/van-damage/InspectionPeriodBadge'
import { InspectionSearchControls } from '@/components/van-damage/InspectionSearchControls'
import { SignedDamageImage } from '@/components/van-damage/SignedDamageImage'
import { formatDriverName } from '@/lib/van-damage/history'
import { formatInspectionTimestamp, resolveInspectionTimeZone } from '@/lib/van-damage/inspection-period'
import {
  defaultInspectionSearchFilters,
  filterAndSortInspections,
  isInspectionSort,
  maxSeverity,
  uniqueOptions,
  type DamageStateFilter,
  type InspectionImageFilter,
  type InspectionReviewFilter,
  type InspectionSearchRow,
} from '@/lib/van-damage/inspection-search'

export const metadata = { title: 'Van Damage AI — ApexCRM' }

type SearchParams = Record<string, string | string[] | undefined>
type QueryResult = Promise<{ data: unknown[] | null; error?: { message: string } | null }>
type LooseQuery = {
  select: (columns: string) => LooseQuery
  eq: (column: string, value: string) => LooseQuery
  order: (column: string, options: { ascending: boolean }) => LooseQuery
  limit: (count: number) => QueryResult
}
type NewTableClient = { from: (table: string) => LooseQuery }

function value(query: SearchParams, key: string) {
  const raw = query[key]
  return Array.isArray(raw) ? raw[0] ?? '' : raw ?? ''
}

function asRecord(input: unknown): Record<string, unknown> {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
}

function text(input: unknown, fallback = '') {
  return typeof input === 'string' && input.trim() ? input.trim() : fallback
}

function stringList(values: Iterable<string | null | undefined>) {
  return [...new Set([...values].filter((entry): entry is string => Boolean(entry)))]
}

export default async function DamageAIPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams
  const scope = await getVanDamagePageScope(value(query, 'businessId'))
  if (!scope.businessId || !scope.tenantId) return <MissingBusiness />

  const db = getVanDamageServiceClient()
  const tables = db as unknown as NewTableClient
  const [inspectionResult, integration, channelResult, tenantResult, vehicleResult, itemResult, observationResult, caseResult, imageResult] = await Promise.all([
    tables.from('van_damage_inspections')
      .select('id, van_id, driver_profile_id, slack_user_id, driver_snapshot, title, status, review_status, image_count, damage_count, ai_summary, ai_confidence, metadata, slack_upload_at, created_at, updated_at, reviewed_at')
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).order('created_at', { ascending: false }).limit(1000),
    loadActiveSlackIntegration(scope.tenantId, scope.businessId),
    db.from('van_slack_channels').select('id', { count: 'exact', head: true })
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).eq('is_enabled', true),
    db.from('tenants').select('branding').eq('id', scope.tenantId).maybeSingle(),
    tables.from('vehicles').select('id, name, van_number').eq('tenant_id', scope.tenantId).limit(1000),
    tables.from('van_damage_items')
      .select('inspection_id, damage_type, normalized_damage_type, vehicle_area, canonical_region, severity, description, repair_recommendation, observation_type, damage_case_id, created_at')
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).limit(10000),
    tables.from('van_damage_observations')
      .select('inspection_id, damage_case_id, observation_type, observed_at').eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).limit(10000),
    tables.from('van_damage_cases')
      .select('id, latest_observed_inspection_id, first_detected_at, first_source_timestamp, last_observed_at, current_severity, lifecycle_status, needs_review, first_reporter_snapshot, latest_uploader_snapshot, metadata')
      .eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).limit(5000),
    tables.from('van_damage_images')
      .select('id, inspection_id, status, created_at').eq('tenant_id', scope.tenantId).eq('business_id', scope.businessId).order('created_at', { ascending: false }).limit(10000),
  ])

  const timeZone = resolveInspectionTimeZone({ tenant: tenantResult.data })
  const vehicles = new Map((vehicleResult.data ?? []).map((row) => {
    const vehicle = asRecord(row)
    return [text(vehicle.id), vehicle]
  }))
  const itemsByInspection = new Map<string, Record<string, unknown>[]>()
  for (const raw of itemResult.data ?? []) {
    const item = asRecord(raw)
    const inspectionId = text(item.inspection_id)
    if (inspectionId) itemsByInspection.set(inspectionId, [...(itemsByInspection.get(inspectionId) ?? []), item])
  }
  const observationsByInspection = new Map<string, Record<string, unknown>[]>()
  const observationCountByCase = new Map<string, number>()
  for (const raw of observationResult.data ?? []) {
    const observation = asRecord(raw)
    const inspectionId = text(observation.inspection_id)
    if (inspectionId) observationsByInspection.set(inspectionId, [...(observationsByInspection.get(inspectionId) ?? []), observation])
    const caseId = text(observation.damage_case_id)
    if (caseId) observationCountByCase.set(caseId, (observationCountByCase.get(caseId) ?? 0) + 1)
  }
  const cases = new Map((caseResult.data ?? []).map((raw) => {
    const damageCase = asRecord(raw)
    return [text(damageCase.id), damageCase]
  }))
  const latestImageByInspection = new Map<string, string>()
  for (const raw of imageResult.data ?? []) {
    const image = asRecord(raw)
    const inspectionId = text(image.inspection_id)
    if (inspectionId && !latestImageByInspection.has(inspectionId) && ['uploaded', 'analyzed'].includes(text(image.status))) latestImageByInspection.set(inspectionId, text(image.id))
  }

  const allRows: InspectionSearchRow[] = (inspectionResult.data ?? []).map((raw) => {
    const inspection = asRecord(raw)
    const id = text(inspection.id)
    const metadata = asRecord(inspection.metadata)
    const driver = asRecord(inspection.driver_snapshot ?? metadata.driver ?? metadata.driverSnapshot)
    const vehicle = vehicles.get(text(inspection.van_id)) ?? {}
    const items = itemsByInspection.get(id) ?? []
    const observations = observationsByInspection.get(id) ?? []
    const linkedCaseIds = stringList([
      ...items.map((item) => text(item.damage_case_id)),
      ...observations.map((observation) => text(observation.damage_case_id)),
    ])
    const linkedCases = linkedCaseIds.map((caseId) => cases.get(caseId)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    const repairStatuses = stringList(linkedCases.map((damageCase) => {
      const caseMetadata = asRecord(damageCase.metadata)
      return text(caseMetadata.repairStatus, text(caseMetadata.repair_status, text(damageCase.lifecycle_status)))
    }))
    const latestDamageAt = linkedCases.map((damageCase) => text(damageCase.first_source_timestamp, text(damageCase.first_detected_at))).filter(Boolean).sort().at(-1)
      ?? items.map((item) => text(item.created_at)).sort().at(-1) ?? null
    const firstDamageAt = linkedCases.map((damageCase) => text(damageCase.first_source_timestamp, text(damageCase.first_detected_at))).filter(Boolean).sort().at(0)
      ?? items.map((item) => text(item.created_at)).filter(Boolean).sort().at(0) ?? null
    const latestObservationAt = linkedCases.map((damageCase) => text(damageCase.last_observed_at)).filter(Boolean).sort().at(-1)
      ?? observations.map((observation) => text(observation.observed_at)).filter(Boolean).sort().at(-1) ?? null
    const snapshotId = (snapshot: Record<string, unknown>) => text(snapshot.driverProfileId, text(snapshot.slackUserId, text(snapshot.slack_user_id)))
    const snapshotName = (snapshot: Record<string, unknown>) => formatDriverName({
      slackUserId: text(snapshot.slackUserId, text(snapshot.slack_user_id)) || null,
      displayName: text(snapshot.displayName, text(snapshot.display_name)) || null,
      realName: text(snapshot.realName, text(snapshot.real_name)) || null,
      username: text(snapshot.username) || null,
    })
    const snapshotIdentity = (snapshot: Record<string, unknown>) => ({
      id: snapshotId(snapshot),
      name: snapshotName(snapshot),
    })
    const firstReporters = linkedCases
      .map((damageCase) => snapshotIdentity(asRecord(damageCase.first_reporter_snapshot)))
      .filter((identity) => identity.id)
    const latestUploaders = linkedCases
      .map((damageCase) => snapshotIdentity(asRecord(damageCase.latest_uploader_snapshot)))
      .filter((identity) => identity.id)
    const vanNumber = text(vehicle.van_number)
    const inspectionNumber = text(metadata.inspectionNumber, text(metadata.inspection_number, `INS-${id.slice(0, 8).toUpperCase()}`))
    const driverId = text(inspection.driver_profile_id, text(inspection.slack_user_id)) || null
    const severities = stringList([...items.map((item) => text(item.severity)), ...linkedCases.map((damageCase) => text(damageCase.current_severity))])
    return {
      id,
      title: text(inspection.title) || null,
      status: text(inspection.status, 'queued'),
      reviewStatus: text(inspection.review_status, 'pending'),
      imageCount: Number(inspection.image_count) || 0,
      damageCount: Number(inspection.damage_count) || 0,
      aiSummary: text(inspection.ai_summary) || null,
      aiConfidence: typeof inspection.ai_confidence === 'number' ? inspection.ai_confidence : Number(inspection.ai_confidence) || null,
      createdAt: text(inspection.created_at),
      updatedAt: text(inspection.updated_at, text(inspection.created_at)),
      reviewedAt: text(inspection.reviewed_at) || null,
      uploadAt: text(inspection.slack_upload_at, text(inspection.created_at)),
      latestDamageAt,
      firstDamageAt,
      latestObservationAt,
      observationCount: linkedCaseIds.reduce((total, caseId) => total + (observationCountByCase.get(caseId) ?? 0), 0),
      driverName: formatDriverName({
        slackUserId: text(driver.slackUserId, text(inspection.slack_user_id)) || null,
        displayName: text(driver.displayName) || null,
        realName: text(driver.realName) || null,
        username: text(driver.username) || null,
      }),
      driverId,
      vanName: text(vehicle.name, vanNumber ? `Van ${vanNumber}` : 'Unassigned van'),
      vanNumber,
      vanId: text(inspection.van_id) || null,
      inspectionNumber,
      damageTypes: stringList(items.map((item) => text(item.normalized_damage_type, text(item.damage_type)))),
      regions: stringList(items.map((item) => text(item.canonical_region, text(item.vehicle_area)))),
      severities,
      observationTypes: stringList([...items.map((item) => text(item.observation_type)), ...observations.map((observation) => text(observation.observation_type))]),
      repairStatuses,
      notes: stringList([...items.map((item) => text(item.description)), ...items.map((item) => text(item.repair_recommendation)), text(metadata.notes)]),
      damageCaseIds: linkedCaseIds,
      firstReporterIds: stringList(firstReporters.map((identity) => identity.id)),
      firstReporterNames: stringList(firstReporters.map((identity) => identity.name)),
      latestUploaderIds: stringList(latestUploaders.map((identity) => identity.id)),
      latestUploaderNames: stringList(latestUploaders.map((identity) => identity.name)),
      hasLevel3: severities.some((severity) => ['high', 'critical', 'level_3'].includes(severity)),
      activeDamageCount: linkedCases.filter((damageCase) => text(damageCase.lifecycle_status) === 'active').length,
      latestImageId: latestImageByInspection.get(id) ?? null,
    }
  })

  const sortValue = value(query, 'sort')
  const filters = {
    ...defaultInspectionSearchFilters,
    q: value(query, 'q'),
    sort: isInspectionSort(sortValue) ? sortValue : defaultInspectionSearchFilters.sort,
    driver: value(query, 'driver') || 'all',
    van: value(query, 'van') || 'all',
    status: value(query, 'status') || 'all',
    severity: value(query, 'severity') || 'all',
    damageType: value(query, 'damageType') || 'all',
    region: value(query, 'region') || 'all',
    period: value(query, 'period') === 'SOD' || value(query, 'period') === 'EOD' ? value(query, 'period') as 'SOD' | 'EOD' : 'all' as const,
    damageState: (['new_damage', 'existing_damage', 'recurring_damage', 'duplicate_observations'].includes(value(query, 'damageState')) ? value(query, 'damageState') : 'all') as DamageStateFilter,
    review: (['needs_review', 'ai_reviewed', 'human_reviewed'].includes(value(query, 'review')) ? value(query, 'review') : 'all') as InspectionReviewFilter,
    images: (['has_images', 'no_images'].includes(value(query, 'images')) ? value(query, 'images') : 'all') as InspectionImageFilter,
    repairStatus: value(query, 'repairStatus') || 'all',
    firstReporter: value(query, 'firstReporter') || 'all',
    latestUploader: value(query, 'latestUploader') || 'all',
    level3: value(query, 'level3') === '1',
    today: value(query, 'today') === '1',
  }
  const results = filterAndSortInspections(allRows, filters, timeZone)
  const pageSize = 25
  const requestedPage = Math.max(1, Number.parseInt(value(query, 'page'), 10) || 1)
  const pageCount = Math.max(1, Math.ceil(results.length / pageSize))
  const page = Math.min(requestedPage, pageCount)
  const inspections = results.slice((page - 1) * pageSize, page * pageSize)
  const connected = publicIntegration(integration)
  const completed = results.filter((item) => item.status === 'completed').length
  const review = results.filter((item) => item.status === 'needs_review').length
  const pending = results.filter((item) => ['queued', 'processing', 'analyzing'].includes(item.status)).length
  const suffix = `?businessId=${encodeURIComponent(scope.businessId)}`
  const env = getVanDamageConfigPresence()
  const driverOptions = [...new Map(allRows.filter((row) => row.driverId).map((row) => [row.driverId!, { value: row.driverId!, label: row.driverName }])).values()].sort((a, b) => a.label.localeCompare(b.label))
  const vanOptions = [...new Map(allRows.filter((row) => row.vanId).map((row) => [row.vanId!, { value: row.vanId!, label: row.vanNumber ? `Van ${row.vanNumber}` : row.vanName }])).values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
  const firstReporterOptions = [...new Map(allRows.flatMap((row) => row.firstReporterIds.map((id, index) => [id, { value: id, label: row.firstReporterNames[index] ?? id }] as const))).values()].sort((a, b) => a.label.localeCompare(b.label))
  const latestUploaderOptions = [...new Map(allRows.flatMap((row) => row.latestUploaderIds.map((id, index) => [id, { value: id, label: row.latestUploaderNames[index] ?? id }] as const))).values()].sort((a, b) => a.label.localeCompare(b.label))

  return <div className="space-y-7">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="text-2xl font-bold text-white">Van Damage AI</h1><p className="mt-1 text-sm text-white/40">Slack-powered van image intake and AI damage analysis</p></div>
      {['owner', 'admin'].includes(scope.ctx.role) && <Link href={`/dashboard/damage-ai/settings/slack${suffix}`} className="inline-flex items-center rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"><Settings className="mr-2 h-4 w-4" />Slack settings</Link>}
    </header>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[
        { label: 'Matching inspections', value: results.length, icon: FileSearch, color: 'text-sky-300' },
        { label: 'In progress', value: pending, icon: Clock3, color: 'text-violet-300' },
        { label: 'Completed', value: completed, icon: CheckCircle2, color: 'text-emerald-300' },
        { label: 'Needs review', value: review, icon: AlertTriangle, color: 'text-amber-300' },
      ].map(({ label, value: count, icon: Icon, color }) => <div key={label} className="rounded-xl border border-white/10 bg-graphite-800 p-4"><Icon className={`h-5 w-5 ${color}`} /><p className="mt-4 text-2xl font-semibold text-white">{count}</p><p className="text-xs text-white/40">{label}</p></div>)}
    </div>

    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-white/10 bg-graphite-800 p-5"><div className="flex items-center justify-between"><div className="flex items-center gap-3"><MessageSquare className="h-5 w-5 text-fuchsia-300" /><div><h2 className="text-sm font-semibold text-white">Slack intake</h2><p className="text-xs text-white/40">{connected.connected ? connected.workspaceName || connected.teamId : 'Disconnected'}</p></div></div><span className={`text-xs ${connected.connected ? 'text-emerald-300' : 'text-white/35'}`}>{connected.connected ? 'Connected' : 'Not configured'}</span></div><p className="mt-4 text-xs text-white/45">Selected channels: {channelResult.count ?? 0}. Image messages outside these channels are ignored.</p></section>
      <section className="rounded-xl border border-white/10 bg-graphite-800 p-5"><h2 className="text-sm font-semibold text-white">Infrastructure configuration</h2><div className="mt-4 grid grid-cols-2 gap-2 text-xs">{[['Queue', env.sqsQueue], ['Private media', env.s3Bucket], ['AI analysis', env.aiAnalysis], ['Data store', env.supabase]].map(([label, ok]) => <div key={String(label)} className="rounded-lg bg-white/[0.03] px-3 py-2 text-white/55">{label}: <span className={ok ? 'text-emerald-300' : 'text-amber-300'}>{ok ? 'configured' : 'missing'}</span></div>)}</div></section>
    </div>

    <InspectionSearchControls
      filters={filters}
      drivers={driverOptions}
      vans={vanOptions}
      statuses={[...new Set(allRows.map((row) => row.status))].sort()}
      severities={uniqueOptions(allRows, 'severities')}
      damageTypes={uniqueOptions(allRows, 'damageTypes')}
      regions={uniqueOptions(allRows, 'regions')}
      repairStatuses={[...new Set(['repair_scheduled', 'in_repair', 'repaired', ...uniqueOptions(allRows, 'repairStatuses')])]}
      firstReporters={firstReporterOptions}
      latestUploaders={latestUploaderOptions}
    />

    <section className="overflow-hidden rounded-xl border border-white/10 bg-graphite-800">
      <div className="flex items-center justify-between border-b border-white/8 px-5 py-4"><div><h2 className="font-semibold text-white">Inspections</h2><p className="mt-1 text-xs text-white/35">{results.length} result{results.length === 1 ? '' : 's'} · page {page} of {pageCount} · times in {timeZone}</p></div></div>
      {inspections.length === 0 ? <div className="p-10 text-center text-sm text-white/35">No inspections match these filters. Clear filters or try a broader search.</div> : <div className="divide-y divide-white/8">
        {inspections.map((inspection, index) => <div key={inspection.id} className="grid gap-4 px-5 py-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
          <div>{inspection.latestImageId ? <SignedDamageImage imageId={inspection.latestImageId} businessId={scope.businessId} alt={`${inspection.vanName} inspection`} eager={index < 3} sizes="128px" /> : <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/10 bg-white/[.02] text-[10px] text-white/25">No image</div>}</div>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium text-white">{inspection.title || inspection.inspectionNumber}</p><InspectionPeriodBadge timestamp={inspection.uploadAt} timeZone={timeZone} /><StatusBadge status={inspection.status} />{maxSeverity(inspection) >= 3 && <span className="rounded-full bg-red-400/10 px-2 py-0.5 text-[10px] text-red-200">Severe</span>}</div><p className="mt-1 text-xs text-white/35">{inspection.vanNumber ? `Van ${inspection.vanNumber}` : inspection.vanName} · {inspection.driverName} · {formatInspectionTimestamp(inspection.uploadAt, { timeZone })}</p><p className="mt-1 text-xs text-white/30">{inspection.inspectionNumber} · {inspection.imageCount} images · {inspection.damageCount} damage items</p>{inspection.aiSummary && <p className="mt-2 line-clamp-2 text-sm text-white/55">{inspection.aiSummary}</p>}</div>
          <div className="flex shrink-0 gap-2"><Link href={`/dashboard/damage-ai/inspections/${inspection.id}${suffix}`} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70 hover:bg-white/5">View</Link>{inspection.status === 'needs_review' && <Link href={`/dashboard/damage-ai/inspections/${inspection.id}${suffix}&review=1`} className="rounded-lg bg-amber-400/15 px-3 py-2 text-xs text-amber-200">Review</Link>}</div>
        </div>)}
      </div>}
      {pageCount > 1 && <nav aria-label="Inspection result pages" className="flex items-center justify-between border-t border-white/8 px-5 py-4"><PaginationLink query={query} page={page - 1} disabled={page <= 1}>Previous</PaginationLink><span className="text-xs text-white/35">{(page - 1) * pageSize + 1}–{Math.min(page * pageSize, results.length)} of {results.length}</span><PaginationLink query={query} page={page + 1} disabled={page >= pageCount}>Next</PaginationLink></nav>}
    </section>
  </div>
}

function PaginationLink({ query, page, disabled, children }: { query: SearchParams; page: number; disabled: boolean; children: ReactNode }) {
  if (disabled) return <span aria-disabled="true" className="rounded-lg border border-white/5 px-3 py-2 text-xs text-white/20">{children}</span>
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, raw]) => {
    const entry = Array.isArray(raw) ? raw[0] : raw
    if (entry) params.set(key, entry)
  })
  params.set('page', String(page))
  return <Link href={`/dashboard/damage-ai?${params.toString()}`} className="focus-ring rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60 hover:bg-white/5">{children}</Link>
}

function MissingBusiness() {
  return <div className="rounded-xl border border-white/10 bg-graphite-800 p-8 text-center"><h1 className="text-xl font-semibold text-white">Select a business</h1><p className="mt-2 text-sm text-white/40">Platform owners must open Van Damage AI with a businessId query parameter.</p><Link href="/owner/tenants" className="mt-5 inline-block text-sm text-gold-300">Browse businesses</Link></div>
}
