export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { InspectionExperience } from '@/components/van-damage/InspectionExperience'
import type { BoundingBox } from '@/components/van-damage/inspection-types'
import { resolveInspectionTimeZone } from '@/lib/van-damage/inspection-period'
import { formatDriverName } from '@/lib/van-damage/history'
import {
  resolveInspectionVehicle,
  selectVehicleProfileImage,
  type InspectionVehicle,
  type VehicleImageCandidate,
} from '@/lib/van-damage/inspection-vehicle'
import type { Json } from '@/lib/supabase/types'
import { requireCommandCenterContext } from '@/lib/command-center/context'
import { loadUniversalNotesResult } from '@/lib/command-center/notes'
import { UniversalNotesPanel } from '@/components/command-center/UniversalNotesPanel'

export const metadata = { title: 'Van Damage Inspection — NexoraNow' }

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeBoundingBox(value: unknown): BoundingBox | null {
  const box = asRecord(value)
  if ([box.x, box.y, box.width, box.height].every((item) => typeof item === 'number')) {
    return {
      x: box.x as number,
      y: box.y as number,
      width: box.width as number,
      height: box.height as number,
    }
  }
  return null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

type QueryResult = Promise<{ data: unknown[] | null; error?: { message: string } | null }>
type LooseQuery = {
  select: (columns: string) => LooseQuery
  eq: (column: string, value: string) => LooseQuery
  neq: (column: string, value: string) => LooseQuery
  in: (column: string, values: string[]) => LooseQuery
  order: (column: string, options: { ascending: boolean }) => LooseQuery
  limit: (count: number) => QueryResult
  maybeSingle: () => Promise<{ data: unknown | null; error?: { message: string } | null }>
}
type NewTableClient = { from: (table: string) => LooseQuery }

type InspectionRow = {
  id: string
  tenant_id: string
  business_id: string
  van_id: string | null
  upload_session_id: string | null
  slack_upload_at: string | null
  source: string
  slack_team_id: string | null
  slack_channel_id: string | null
  slack_message_ts: string | null
  slack_thread_ts: string | null
  slack_user_id: string | null
  driver_snapshot: Record<string, unknown>
  title: string | null
  status: string
  image_count: number
  damage_count: number
  ai_summary: string | null
  ai_confidence: number | null
  review_status: string
  reviewed_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
  completed_at: string | null
}

function safeInspectionMetadata(value: Record<string, unknown>) {
  const phase = asRecord(value.phase3c)
  const comments = Array.isArray(phase.comments)
    ? phase.comments.flatMap((raw) => {
        const comment = asRecord(raw)
        const id = text(comment.id)
        if (!id) return []
        return [
          {
            id,
            body: text(comment.body),
            parentId: text(comment.parentId),
            kind: text(comment.kind),
            authorName: text(comment.authorName),
            createdAt: text(comment.createdAt),
            attachments: Array.isArray(comment.attachments)
              ? comment.attachments.flatMap((attachmentRaw) => {
                  const attachment = asRecord(attachmentRaw)
                  const attachmentId = text(attachment.id)
                  return attachmentId
                    ? [
                        {
                          id: attachmentId,
                          name: text(attachment.name),
                          contentType: text(attachment.contentType),
                          size: typeof attachment.size === 'number' ? attachment.size : null,
                        },
                      ]
                    : []
                })
              : [],
          },
        ]
      })
    : []
  const auditTrail = Array.isArray(phase.auditTrail)
    ? phase.auditTrail.flatMap((raw) => {
        const event = asRecord(raw)
        const id = text(event.id)
        return id
          ? [
              {
                id,
                type: text(event.type),
                label: text(event.label),
                actorName: text(event.actorName),
                createdAt: text(event.createdAt),
              },
            ]
          : []
      })
    : []
  return {
    vanNumber: text(value.vanNumber),
    phase3c: {
      lifecycle: text(phase.lifecycle),
      comments,
      auditTrail,
    },
  }
}

async function auditInspectionEvent(
  db: ReturnType<typeof getVanDamageServiceClient>,
  input: {
    tenantId: string
    actorId: string
    inspectionId: string
    action: string
    metadata?: Record<string, string | number | boolean | null>
  }
) {
  const { error } = await db.from('activity_logs').insert({
    tenant_id: input.tenantId,
    actor_type: 'user',
    actor_id: input.actorId,
    action: input.action,
    entity_type: 'van_damage_inspection',
    entity_id: input.inspectionId,
    metadata: (input.metadata ?? {}) as Json,
  })
  if (error) console.error('[inspection-audit] Unable to record event:', error.code)
}

export default async function InspectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ inspectionId: string }>
  searchParams: Promise<{ businessId?: string; returnTo?: string }>
}) {
  const [{ inspectionId }, query] = await Promise.all([params, searchParams])
  const scope = await getVanDamagePageScope(query.businessId)
  if (!scope.businessId || !scope.tenantId) notFound()

  const db = getVanDamageServiceClient()
  const looseDb = db as unknown as NewTableClient
  const { data: inspectionRaw } = await looseDb
    .from('van_damage_inspections')
    .select(
      'id,tenant_id,business_id,van_id,upload_session_id,slack_upload_at,source,slack_team_id,slack_channel_id,slack_message_ts,slack_thread_ts,slack_user_id,driver_snapshot,title,status,image_count,damage_count,ai_summary,ai_confidence,review_status,reviewed_at,metadata,created_at,updated_at,completed_at'
    )
    .eq('id', inspectionId)
    .eq('tenant_id', scope.tenantId)
    .eq('business_id', scope.businessId)
    .maybeSingle()
  if (!inspectionRaw) notFound()
  const inspectionRecord = inspectionRaw as Record<string, unknown>
  const inspection = {
    ...inspectionRecord,
    driver_snapshot: asRecord(inspectionRecord.driver_snapshot),
    metadata: asRecord(inspectionRecord.metadata),
  } as InspectionRow

  const vehicleResolution = await resolveInspectionVehicle(
    {
      tenantId: scope.tenantId,
      businessId: scope.businessId,
      inspectionId,
      inspectionVanId: inspection.van_id,
      uploadSessionId: inspection.upload_session_id,
      metadata: inspection.metadata,
    },
    {
      async loadVehicleById(tenantId, vehicleId) {
        const { data } = await db
          .from('vehicles')
          .select(
            'id,tenant_id,name,van_number,make,model,year,color,plate_number,vin,status,metadata'
          )
          .eq('id', vehicleId)
          .eq('tenant_id', tenantId)
          .maybeSingle()
        return data ? ({ ...data, metadata: asRecord(data.metadata) } as InspectionVehicle) : null
      },
      async loadUploadSession(tenantId, businessId, uploadSessionId, targetInspectionId) {
        if (uploadSessionId) {
          const { data } = await looseDb
            .from('van_damage_upload_sessions')
            .select('id,van_id')
            .eq('id', uploadSessionId)
            .eq('tenant_id', tenantId)
            .eq('business_id', businessId)
            .maybeSingle()
          const row = asRecord(data)
          return text(row.id) ? { id: text(row.id)!, vanId: text(row.van_id) } : null
        }
        const { data } = await looseDb
          .from('van_damage_upload_sessions')
          .select('id,van_id')
          .eq('inspection_id', targetInspectionId)
          .eq('tenant_id', tenantId)
          .eq('business_id', businessId)
          .order('created_at', { ascending: false })
          .limit(2)
        const row = asRecord(data?.[0])
        return text(row.id) ? { id: text(row.id)!, vanId: text(row.van_id) } : null
      },
      async loadVehiclesByNumber(tenantId, vanNumber, limit) {
        const { data } = await db
          .from('vehicles')
          .select(
            'id,tenant_id,name,van_number,make,model,year,color,plate_number,vin,status,metadata'
          )
          .eq('tenant_id', tenantId)
          .eq('van_number', vanNumber)
          .limit(limit)
        return (data ?? []).map(
          (vehicle) => ({ ...vehicle, metadata: asRecord(vehicle.metadata) }) as InspectionVehicle
        )
      },
    }
  )
  const resolvedVehicle = vehicleResolution.vehicle

  let vehicleImage = {
    imageId: null as string | null,
    source: 'placeholder' as
      | 'primary_profile'
      | 'featured_fleet'
      | 'approved_vehicle_image'
      | 'automatic_first_upload'
      | 'placeholder',
  }
  if (resolvedVehicle) {
    const { data } = await looseDb
      .from('van_damage_images')
      .select(
        'id,image_role,created_at,upload_order,original_file_index,van_damage_inspections!inner(van_id)'
      )
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .eq('van_damage_inspections.van_id', resolvedVehicle.id)
      .in('status', ['uploaded', 'analyzed'])
      .order('created_at', { ascending: false })
      .limit(100)
    const candidates: VehicleImageCandidate[] = (data ?? []).flatMap((raw) => {
      const row = asRecord(raw)
      const id = text(row.id)
      const createdAt = text(row.created_at)
      return id && createdAt
        ? [
            {
              id,
              imageRole: text(row.image_role),
              createdAt,
              uploadOrder: typeof row.upload_order === 'number' ? row.upload_order : null,
              originalFileIndex:
                typeof row.original_file_index === 'number' ? row.original_file_index : null,
            },
          ]
        : []
    })
    vehicleImage = selectVehicleProfileImage(resolvedVehicle.metadata, candidates, {
      allowAutomaticFirstUpload: true,
    })
  }

  const [
    imagesResult,
    itemsResult,
    runsResult,
    jobResult,
    tenantResult,
    channelResult,
    integrationResult,
    relatedResult,
    casesResult,
    activeCasesResult,
    maintenanceResult,
  ] = await Promise.all([
    db
      .from('van_damage_images')
      .select(
        'id,slack_file_id,content_type,file_size_bytes,width,height,image_role,status,created_at,updated_at'
      )
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .order('created_at'),
    looseDb
      .from('van_damage_items')
      .select(
        'id,image_id,damage_type,normalized_damage_type,vehicle_area,canonical_region,severity,confidence,description,repair_recommendation,bounding_box,damage_case_id,observation_type,created_at'
      )
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .order('created_at', { ascending: true })
      .limit(500),
    looseDb
      .from('van_damage_ai_runs')
      .select(
        scope.ctx.role === 'owner'
          ? 'id,status,input_summary,parsed_response,created_at,completed_at'
          : 'id,status,parsed_response,created_at,completed_at'
      )
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .order('created_at', { ascending: false })
      .limit(1),
    db
      .from('van_damage_jobs')
      .select(
        scope.ctx.role === 'owner'
          ? 'id,status,attempt_count,created_at,started_at,completed_at,payload'
          : 'status,attempt_count,created_at,started_at,completed_at'
      )
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', scope.tenantId)
      .eq('business_id', scope.businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('tenants').select('name, branding').eq('id', scope.tenantId).maybeSingle(),
    inspection.slack_channel_id
      ? db
          .from('van_slack_channels')
          .select('slack_channel_name')
          .eq('tenant_id', scope.tenantId)
          .eq('slack_channel_id', inspection.slack_channel_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    inspection.slack_team_id
      ? db
          .from('van_slack_integrations')
          .select('slack_team_name')
          .eq('tenant_id', scope.tenantId)
          .eq('slack_team_id', inspection.slack_team_id)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    resolvedVehicle
      ? db
          .from('van_damage_inspections')
          .select('id, status, damage_count, ai_confidence, created_at')
          .eq('tenant_id', scope.tenantId)
          .eq('business_id', scope.businessId)
          .eq('van_id', resolvedVehicle.id)
          .neq('id', inspectionId)
          .order('created_at', { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
    resolvedVehicle
      ? looseDb
          .from('van_damage_cases')
          .select(
            'id,first_detected_inspection_id,first_upload_session_id,first_evidence_image_id,first_reporter_snapshot,first_source_timestamp,first_source_timestamp_kind,latest_uploader_snapshot,last_observed_at,observation_count,current_severity,lifecycle_status,needs_review,metadata'
          )
          .eq('tenant_id', scope.tenantId)
          .eq('business_id', scope.businessId)
          .eq('van_id', resolvedVehicle.id)
          .limit(500)
      : Promise.resolve({ data: [] }),
    resolvedVehicle
      ? looseDb
          .from('van_damage_cases')
          .select('id,lifecycle_status,current_severity')
          .eq('tenant_id', scope.tenantId)
          .eq('business_id', scope.businessId)
          .eq('van_id', resolvedVehicle.id)
          .limit(500)
      : Promise.resolve({ data: [] }),
    resolvedVehicle
      ? db
          .from('fleet_maintenance_items')
          .select('id,status')
          .eq('tenant_id', scope.tenantId)
          .eq('business_id', scope.businessId)
          .eq('van_id', resolvedVehicle.id)
          .limit(500)
      : Promise.resolve({ data: [] }),
  ])
  const attributionByCase = new Map(
    ((casesResult.data ?? []) as Array<Record<string, unknown>>).map((row) => [String(row.id), row])
  )

  const slackUrl =
    inspection.slack_team_id && inspection.slack_channel_id && inspection.slack_message_ts
      ? `https://app.slack.com/client/${inspection.slack_team_id}/${inspection.slack_channel_id}/${inspection.slack_message_ts.replace('.', '')}`
      : null

  const images = (imagesResult.data ?? []).map((image) => ({
    id: image.id,
    slack_file_id: image.slack_file_id,
    content_type: image.content_type,
    file_size_bytes: image.file_size_bytes,
    width: image.width,
    height: image.height,
    image_role: image.image_role,
    status: image.status,
    created_at: image.created_at,
    updated_at: image.updated_at,
  }))
  const items = (itemsResult.data ?? []).flatMap((raw) => {
    const item = asRecord(raw)
    const id = text(item.id)
    if (!id) return []
    const damageCaseId = text(item.damage_case_id)
    return [
      {
        damage_case_id: damageCaseId,
        observation_type: text(item.observation_type),
        normalized_damage_type: text(item.normalized_damage_type),
        canonical_region: text(item.canonical_region),
        first_attribution:
          damageCaseId && attributionByCase.has(damageCaseId)
            ? (() => {
                const attribution = attributionByCase.get(damageCaseId)!
                return {
                  reporter: asRecord(attribution.first_reporter_snapshot),
                  sourceTimestamp:
                    typeof attribution.first_source_timestamp === 'string'
                      ? attribution.first_source_timestamp
                      : null,
                  sourceTimestampKind:
                    typeof attribution.first_source_timestamp_kind === 'string'
                      ? attribution.first_source_timestamp_kind
                      : null,
                  inspectionId:
                    typeof attribution.first_detected_inspection_id === 'string'
                      ? attribution.first_detected_inspection_id
                      : null,
                  uploadSessionId:
                    typeof attribution.first_upload_session_id === 'string'
                      ? attribution.first_upload_session_id
                      : null,
                  evidenceImageId:
                    typeof attribution.first_evidence_image_id === 'string'
                      ? attribution.first_evidence_image_id
                      : null,
                  latestUploader: asRecord(attribution.latest_uploader_snapshot),
                  lastObservedAt: text(attribution.last_observed_at),
                  observationCount:
                    typeof attribution.observation_count === 'number'
                      ? attribution.observation_count
                      : 0,
                  needsReview: attribution.needs_review === true,
                  repairStatus:
                    text(asRecord(attribution.metadata).repairStatus) ??
                    text(attribution.lifecycle_status),
                }
              })()
            : null,
        id,
        image_id: text(item.image_id),
        damage_type: text(item.damage_type),
        vehicle_area: text(item.vehicle_area),
        severity: text(item.severity),
        confidence: typeof item.confidence === 'number' ? item.confidence : null,
        description: text(item.description),
        repair_recommendation: text(item.repair_recommendation),
        bounding_box: normalizeBoundingBox(item.bounding_box),
        created_at: text(item.created_at) ?? inspection.created_at,
      },
    ]
  })
  const aiRunRaw = asRecord(runsResult.data?.[0])
  const aiRun = text(aiRunRaw.id)
    ? {
        id: text(aiRunRaw.id)!,
        status: text(aiRunRaw.status) ?? inspection.status,
        parsed_response: asRecord(aiRunRaw.parsed_response),
        created_at: text(aiRunRaw.created_at) ?? inspection.created_at,
        completed_at: text(aiRunRaw.completed_at),
      }
    : null
  const jobRecord = asRecord(jobResult.data)
  const job = text(jobRecord.status)
    ? {
        status: text(jobRecord.status)!,
        attempt_count: typeof jobRecord.attempt_count === 'number' ? jobRecord.attempt_count : 0,
        created_at: text(jobRecord.created_at) ?? inspection.created_at,
        started_at: text(jobRecord.started_at),
        completed_at: text(jobRecord.completed_at),
      }
    : null
  const uploaderName = formatDriverName({
    slackUserId: inspection.slack_user_id,
    displayName:
      text(inspection.driver_snapshot.displayName) ?? text(inspection.driver_snapshot.display_name),
    realName:
      text(inspection.driver_snapshot.realName) ?? text(inspection.driver_snapshot.real_name),
    username: text(inspection.driver_snapshot.username),
  })
  const activeLevel3Count = (activeCasesResult.data ?? []).filter((raw) => {
    const row = asRecord(raw)
    return (
      [
        'active',
        'needs_review',
        'confirmed',
        'repair_scheduled',
        'in_repair',
        'recurrent',
      ].includes(text(row.lifecycle_status) ?? '') &&
      ['high', 'critical', 'level_3'].includes(text(row.current_severity) ?? '')
    )
  }).length
  const activeMaintenanceCount = (maintenanceResult.data ?? []).filter(
    (item) => !['completed', 'cancelled'].includes(item.status)
  ).length
  const ownerMetadata =
    scope.ctx.role === 'owner'
      ? {
          source: {
            workspace: integrationResult.data?.slack_team_name ?? null,
            channel: channelResult.data?.slack_channel_name ?? null,
            messageTimestamp: inspection.slack_message_ts,
            uploadSessionId: vehicleResolution.uploadSessionId,
          },
          processing: {
            inspectionCreatedAt: inspection.created_at,
            analysisStartedAt: text(aiRunRaw.created_at),
            analysisCompletedAt: text(aiRunRaw.completed_at) ?? inspection.completed_at,
            retryCount: typeof jobRecord.attempt_count === 'number' ? jobRecord.attempt_count : 0,
            workerStatus: text(jobRecord.status),
            workerVersion: text(asRecord(jobRecord.payload).workerVersion),
          },
          storage: {
            imageCount: images.length,
            provider: 'Private object storage',
            cache: 'Temporary signed URL cache',
          },
          database: {
            inspectionId: inspection.id,
            vehicleId: resolvedVehicle?.id ?? null,
            damageCaseIds: [
              ...new Set(
                items.map((item) => item.damage_case_id).filter((id): id is string => Boolean(id))
              ),
            ],
            createdAt: inspection.created_at,
            updatedAt: inspection.updated_at,
          },
          vehicleResolution: {
            state: vehicleResolution.state,
            source: vehicleResolution.source,
          },
        }
      : null

  await Promise.all([
    auditInspectionEvent(db, {
      tenantId: scope.tenantId,
      actorId: scope.ctx.id,
      inspectionId,
      action: 'van_damage.inspection_viewed',
      metadata: {
        vehicle_resolution_state: vehicleResolution.state,
        vehicle_resolution_source: vehicleResolution.source,
      },
    }),
    vehicleResolution.state === 'resolved'
      ? auditInspectionEvent(db, {
          tenantId: scope.tenantId,
          actorId: scope.ctx.id,
          inspectionId,
          action: `van_damage.vehicle_resolved.${vehicleResolution.source}`,
          metadata: { vehicle_id: vehicleResolution.vehicle.id },
        })
      : auditInspectionEvent(db, {
          tenantId: scope.tenantId,
          actorId: scope.ctx.id,
          inspectionId,
          action:
            vehicleResolution.state === 'ambiguous'
              ? 'van_damage.vehicle_resolution_ambiguous'
              : 'van_damage.vehicle_resolution_missing',
        }),
    scope.ctx.role === 'owner'
      ? auditInspectionEvent(db, {
          tenantId: scope.tenantId,
          actorId: scope.ctx.id,
          inspectionId,
          action: 'van_damage.inspection_metadata_viewed',
        })
      : Promise.resolve(),
    resolvedVehicle && !vehicleImage.imageId
      ? auditInspectionEvent(db, {
          tenantId: scope.tenantId,
          actorId: scope.ctx.id,
          inspectionId,
          action: 'van_damage.vehicle_image_unavailable',
          metadata: { vehicle_id: resolvedVehicle.id },
        })
      : Promise.resolve(),
  ])
  const commandContext = await requireCommandCenterContext('use_modules')
  const notes = await loadUniversalNotesResult(commandContext, 'inspection', inspectionId)

  return (
    <div className="space-y-6">
      <InspectionExperience
        businessId={scope.businessId}
        returnHref={
          query.returnTo?.startsWith('/dashboard/damage-ai?') ? query.returnTo : undefined
        }
        tenantName={tenantResult.data?.name || 'NexoraNow workspace'}
        timeZone={resolveInspectionTimeZone({ tenant: tenantResult.data })}
        canManage={['owner', 'admin'].includes(scope.ctx.role)}
        canViewMetadata={scope.ctx.role === 'owner'}
        uploaderName={uploaderName}
        inspectionTimestamp={inspection.slack_upload_at ?? inspection.created_at}
        inspection={{
          id: inspection.id,
          title: inspection.title,
          status: inspection.status,
          review_status: inspection.review_status,
          source: inspection.source,
          image_count: inspection.image_count,
          damage_count: inspection.damage_count,
          ai_summary: inspection.ai_summary,
          ai_confidence: inspection.ai_confidence,
          van_id: resolvedVehicle?.id ?? inspection.van_id,
          metadata: safeInspectionMetadata(inspection.metadata),
          created_at: inspection.created_at,
          updated_at: inspection.updated_at,
          completed_at: inspection.completed_at,
          reviewed_at: inspection.reviewed_at,
        }}
        vehicle={resolvedVehicle}
        vehicleResolution={{
          state: vehicleResolution.state,
          source: vehicleResolution.source,
        }}
        vehicleImage={vehicleImage}
        vehicleStats={{
          activeLevel3Count,
          activeMaintenanceCount,
          lastInspectionAt: relatedResult.data?.[0]?.created_at ?? inspection.created_at,
        }}
        images={images}
        items={items}
        aiRun={aiRun}
        job={job}
        ownerMetadata={ownerMetadata}
        related={relatedResult.data ?? []}
        slack={{
          workspace: integrationResult.data?.slack_team_name ?? null,
          channel: channelResult.data?.slack_channel_name
            ? `#${channelResult.data.slack_channel_name}`
            : null,
          url: slackUrl,
        }}
      />
      <UniversalNotesPanel
        entityType="inspection"
        entityId={inspectionId}
        initialNotes={notes.notes}
        loadError={notes.error}
        canManageVisibility={['owner', 'admin', 'manager'].includes(scope.ctx.role)}
      />
    </div>
  )
}
