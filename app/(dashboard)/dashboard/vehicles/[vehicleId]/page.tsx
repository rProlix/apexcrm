export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import {
  VanProfileWorkspace,
  type VanProfileCase,
  type VanProfileImage,
  type VanProfileSession,
} from '@/components/van-damage/VanProfileWorkspace'
import { resolveInspectionTimeZone } from '@/lib/van-damage/inspection-period'

export const metadata = { title: 'Vehicle Profile — NexoraNow' }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asProfileImage(value: unknown): VanProfileImage {
  const record = asRecord(value)
  const mode =
    record.mode === 'manual' || record.mode === 'automatic_first_upload' ? record.mode : 'fallback'
  return { mode, imageId: typeof record.imageId === 'string' ? record.imageId : null }
}

type LooseQuery = {
  select: (columns: string) => LooseQuery
  eq: (column: string, value: string) => LooseQuery
  order: (column: string, options: { ascending: boolean }) => LooseQuery
  limit: (count: number) => Promise<{ data: unknown[] | null; error?: { message: string } | null }>
}
type NewTableClient = { from: (table: string) => LooseQuery }

type VanProfileImageRow = {
  id: string
  inspection_id: string
  upload_session_id: string | null
  upload_order: number | null
  original_file_index: number | null
  status: string
  image_role: string | null
  created_at: string
  s3_key: string | null
}

export default async function VehicleProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ vehicleId: string }>
  searchParams: Promise<{ businessId?: string }>
}) {
  const [{ vehicleId }, query] = await Promise.all([params, searchParams])
  const scope = await getVanDamagePageScope(query.businessId)
  if (!scope.businessId || !scope.tenantId) notFound()

  const db = getVanDamageServiceClient()
  const newTables = db as unknown as NewTableClient
  const { data: vehicle } = await db
    .from('vehicles')
    .select('id, name, van_number, make, model, year, plate_number, vin, status, metadata')
    .eq('id', vehicleId)
    .eq('tenant_id', scope.tenantId)
    .maybeSingle()
  if (!vehicle) notFound()

  const [
    sessionsResult,
    inspectionsResult,
    imagesResult,
    casesResult,
    observationsResult,
    channelsResult,
    tenantResult,
    maintenanceResult,
  ] = await Promise.all([
    newTables
      .from('van_damage_upload_sessions')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .eq('van_id', vehicleId)
      .order('upload_started_at', { ascending: false })
      .limit(50),
    db
      .from('van_damage_inspections')
      .select(
        'id, status, review_status, damage_count, ai_summary, ai_confidence, created_at, completed_at'
      )
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .eq('van_id', vehicleId)
      .order('created_at', { ascending: false })
      .limit(50),
    newTables
      .from('van_damage_images')
      .select(
        'id, inspection_id, upload_session_id, upload_order, original_file_index, status, image_role, created_at, s3_key'
      )
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .order('created_at', { ascending: true })
      .limit(500),
    newTables
      .from('van_damage_cases')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .eq('van_id', vehicleId)
      .order('last_observed_at', { ascending: false })
      .limit(100),
    newTables
      .from('van_damage_observations')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .eq('van_id', vehicleId)
      .order('observed_at', { ascending: false })
      .limit(500),
    db
      .from('van_slack_channels')
      .select('slack_channel_id, slack_channel_name')
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId),
    db.from('tenants').select('branding').eq('id', scope.tenantId).maybeSingle(),
    db
      .from('fleet_maintenance_items')
      .select('*')
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .eq('van_id', vehicleId)
      .order('latest_activity_at', { ascending: false })
      .limit(100),
  ])

  const inspections = new Map(
    (inspectionsResult.data ?? []).map((inspection) => [inspection.id, inspection])
  )
  const sessions = (sessionsResult.data ?? []) as VanProfileSession[]
  const sessionIds = new Set(sessions.map((session) => session.id))
  const images = ((imagesResult.data ?? []) as VanProfileImageRow[]).filter(
    (image) => image.upload_session_id && sessionIds.has(image.upload_session_id)
  )
  const observations = (observationsResult.data ?? []) as Array<
    VanProfileCase['observations'][number] & { damage_case_id: string | null }
  >
  const channels = new Map(
    (channelsResult.data ?? []).map(
      (channel: { slack_channel_id: string; slack_channel_name: string | null }) => [
        channel.slack_channel_id,
        channel.slack_channel_name,
      ]
    )
  )
  const profileImage = asProfileImage(asRecord(asRecord(vehicle.metadata).vanDamage).profileImage)
  const fallbackProfileImageId =
    images.find((image) => image.s3_key && ['uploaded', 'analyzed'].includes(image.status))?.id ??
    null
  const hydratedSessions: VanProfileSession[] = sessions.map((session) => ({
    ...session,
    driver_snapshot: asRecord(session.driver_snapshot),
    channelName:
      typeof channels.get(session.slack_channel_id) === 'string'
        ? channels.get(session.slack_channel_id)!
        : null,
    inspection: (inspections.get(session.inspection_id) ?? null) as VanProfileSession['inspection'],
    images: images
      .filter((image) => image.upload_session_id === session.id)
      .sort(
        (a, b) =>
          (a.upload_order ?? a.original_file_index ?? 2147483647) -
          (b.upload_order ?? b.original_file_index ?? 2147483647)
      )
      .map((image) => ({
        id: image.id,
        upload_order: image.upload_order,
        status: image.status,
        image_role: image.image_role,
      })),
    observations: observations
      .filter((observation) => observation.upload_session_id === session.id)
      .map((observation) => ({
        observation_type: observation.observation_type,
        severity: observation.severity,
      })),
  }))
  const hydratedCases: VanProfileCase[] = ((casesResult.data ?? []) as VanProfileCase[]).map(
    (damageCase) => ({
      ...damageCase,
      observations: observations
        .filter((observation) => observation.damage_case_id === damageCase.id)
        .map((observation) => ({
          ...observation,
          driver_snapshot: asRecord(observation.driver_snapshot),
        })),
    })
  )

  return (
    <div className="p-4 md:p-6">
      <VanProfileWorkspace
        businessId={scope.businessId}
        timeZone={resolveInspectionTimeZone({ tenant: tenantResult.data })}
        canManage={['owner', 'admin'].includes(scope.ctx.role)}
        vehicle={{ ...vehicle, metadata: asRecord(vehicle.metadata) }}
        profileImage={profileImage}
        fallbackProfileImageId={fallbackProfileImageId}
        latestSession={hydratedSessions[0] ?? null}
        sessions={hydratedSessions}
        cases={hydratedCases}
        maintenance={(maintenanceResult.data ?? []).map((item) => ({
          id: item.id,
          maintenance_number: item.maintenance_number,
          title: item.title,
          status: item.status,
          effective_priority: item.effective_priority,
          resolution_effort: item.resolution_effort,
          latest_activity_at: item.latest_activity_at,
          due_at: item.due_at,
        }))}
      />
    </div>
  )
}
