export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { getVanDamagePageScope } from '@/lib/server/van-damage/page-scope'
import { getVanDamageServiceClient } from '@/lib/server/van-damage/supabase'
import { InspectionExperience } from '@/components/van-damage/InspectionExperience'
import type { BoundingBox } from '@/components/van-damage/inspection-types'
import { resolveInspectionTimeZone } from '@/lib/van-damage/inspection-period'

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
  const looseDb = db as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (
          column: string,
          value: string
        ) => {
          eq: (
            column: string,
            value: string
          ) => {
            limit: (count: number) => Promise<{ data: unknown[] | null }>
          }
        }
      }
    }
  }
  const { data: inspection } = await db
    .from('van_damage_inspections')
    .select('*')
    .eq('id', inspectionId)
    .eq('tenant_id', scope.tenantId)
    .eq('business_id', scope.businessId)
    .maybeSingle()
  if (!inspection) notFound()

  const [
    imagesResult,
    itemsResult,
    runsResult,
    jobResult,
    tenantResult,
    vehicleResult,
    channelResult,
    integrationResult,
    relatedResult,
    casesResult,
  ] = await Promise.all([
    db
      .from('van_damage_images')
      .select('*')
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', scope.tenantId)
      .order('created_at'),
    db
      .from('van_damage_items')
      .select('*')
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', scope.tenantId)
      .order('created_at'),
    ['owner', 'admin'].includes(scope.ctx.role)
      ? db
          .from('van_damage_ai_runs')
          .select('*')
          .eq('inspection_id', inspectionId)
          .eq('tenant_id', scope.tenantId)
          .order('created_at', { ascending: false })
          .limit(1)
      : Promise.resolve({ data: [] }),
    db
      .from('van_damage_jobs')
      .select('*')
      .eq('inspection_id', inspectionId)
      .eq('tenant_id', scope.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from('tenants').select('name, branding').eq('id', scope.tenantId).maybeSingle(),
    inspection.van_id
      ? db
          .from('vehicles')
          .select(
            'id, name, van_number, make, model, year, color, plate_number, vin, status, metadata'
          )
          .eq('id', inspection.van_id)
          .eq('tenant_id', scope.tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
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
    inspection.van_id
      ? db
          .from('van_damage_inspections')
          .select('id, status, damage_count, ai_confidence, created_at')
          .eq('tenant_id', scope.tenantId)
          .eq('business_id', scope.businessId)
          .eq('van_id', inspection.van_id)
          .neq('id', inspectionId)
          .order('created_at', { ascending: false })
          .limit(12)
      : Promise.resolve({ data: [] }),
    inspection.van_id
      ? looseDb
          .from('van_damage_cases')
          .select(
            'id,first_detected_inspection_id,first_upload_session_id,first_evidence_image_id,first_reporter_snapshot,first_source_timestamp,first_source_timestamp_kind,latest_uploader_snapshot'
          )
          .eq('tenant_id', scope.tenantId)
          .eq('business_id', scope.businessId)
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
  const items = (itemsResult.data ?? []).map((item) => ({
    ...(() => {
      const extended = item as typeof item & {
        damage_case_id?: string | null
        observation_type?: string | null
        normalized_damage_type?: string | null
        canonical_region?: string | null
      }
      return {
        damage_case_id: extended.damage_case_id ?? null,
        observation_type: extended.observation_type ?? null,
        normalized_damage_type: extended.normalized_damage_type ?? null,
        canonical_region: extended.canonical_region ?? null,
        first_attribution:
          extended.damage_case_id && attributionByCase.has(extended.damage_case_id)
            ? (() => {
                const attribution = attributionByCase.get(extended.damage_case_id!)!
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
                }
              })()
            : null,
      }
    })(),
    id: item.id,
    image_id: item.image_id,
    damage_type: item.damage_type,
    vehicle_area: item.vehicle_area,
    severity: item.severity,
    confidence: item.confidence,
    description: item.description,
    repair_recommendation: item.repair_recommendation,
    bounding_box: normalizeBoundingBox(item.bounding_box),
    created_at: item.created_at,
  }))
  const aiRun = runsResult.data?.[0]
    ? {
        ...runsResult.data[0],
        input_summary: asRecord(runsResult.data[0].input_summary),
        parsed_response: asRecord(runsResult.data[0].parsed_response),
      }
    : null

  return (
    <InspectionExperience
      businessId={scope.businessId}
      returnHref={query.returnTo?.startsWith('/dashboard/damage-ai?') ? query.returnTo : undefined}
      tenantName={tenantResult.data?.name || 'NexoraNow workspace'}
      timeZone={resolveInspectionTimeZone({ tenant: tenantResult.data })}
      canManage={['owner', 'admin'].includes(scope.ctx.role)}
      inspection={{ ...inspection, metadata: asRecord(inspection.metadata) }}
      vehicle={
        vehicleResult.data
          ? { ...vehicleResult.data, metadata: asRecord(vehicleResult.data.metadata) }
          : null
      }
      images={images}
      items={items}
      aiRun={aiRun}
      job={jobResult.data ? { ...jobResult.data, payload: asRecord(jobResult.data.payload) } : null}
      related={relatedResult.data ?? []}
      slack={{
        workspace: integrationResult.data?.slack_team_name ?? null,
        channel: channelResult.data?.slack_channel_name
          ? `#${channelResult.data.slack_channel_name}`
          : null,
        url: slackUrl,
      }}
    />
  )
}
