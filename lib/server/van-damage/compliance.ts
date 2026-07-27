import {
  defaultInspectionSchedule,
  getInspectionComplianceForTenant,
  type ComplianceSubmission,
  type ComplianceVehicle,
  type InspectionSchedule,
} from '@/lib/van-damage/compliance'
import { getInspectionPeriod } from '@/lib/van-damage/inspection-period'
import type { CommandCenterContext } from '@/lib/command-center/context'

type Row = Record<string, unknown>
type LooseResult = Promise<{ data: unknown[] | null; error: { code?: string } | null }>
type LooseQuery = {
  select: (columns: string) => LooseQuery
  eq: (column: string, value: string | boolean) => LooseQuery
  gte: (column: string, value: string) => LooseQuery
  lte: (column: string, value: string) => LooseQuery
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery
  limit: (value: number) => LooseResult
}

function record(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Row) : {}
}
function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}
function number(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
function strings(value: unknown, fallback: string[]) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : fallback
}

export async function loadInspectionCompliance(
  context: CommandCenterContext,
  input: { from: string; to: string; now?: Date }
) {
  const db = context.db as unknown as { from: (table: string) => LooseQuery }
  const queryStart = `${input.from}T00:00:00.000Z`
  const queryEnd = `${input.to}T23:59:59.999Z`
  const [vehiclesResult, inspectionsResult, imagesResult, scheduleResult, excusesResult] =
    await Promise.all([
      db
        .from('vehicles')
        .select('id,name,van_number,status,metadata')
        .eq('tenant_id', context.tenantId)
        .limit(2000),
      db
        .from('van_damage_inspections')
        .select(
          'id,van_id,status,review_status,driver_snapshot,metadata,slack_upload_at,created_at'
        )
        .eq('tenant_id', context.tenantId)
        .gte('created_at', queryStart)
        .lte('created_at', queryEnd)
        .order('created_at', { ascending: true })
        .limit(10000),
      db
        .from('van_damage_images')
        .select('inspection_id,image_role,status,metadata')
        .eq('tenant_id', context.tenantId)
        .gte('created_at', queryStart)
        .lte('created_at', queryEnd)
        .limit(50000),
      db
        .from('van_inspection_schedules')
        .select('*')
        .eq('tenant_id', context.tenantId)
        .eq('is_default', true)
        .eq('is_active', true)
        .limit(1),
      db
        .from('van_inspection_excuses')
        .select('van_id,slot_date,slot_type,reason')
        .eq('tenant_id', context.tenantId)
        .gte('slot_date', input.from)
        .lte('slot_date', input.to)
        .limit(10000),
    ])
  const failed = [
    vehiclesResult.error,
    inspectionsResult.error,
    imagesResult.error,
    scheduleResult.error,
    excusesResult.error,
  ].find(Boolean)
  if (failed)
    throw new Error(`Inspection compliance could not be loaded (${failed.code ?? 'query_failed'}).`)

  const rawSchedule = record(scheduleResult.data?.[0])
  const defaults = defaultInspectionSchedule(context.timeZone)
  const schedule: InspectionSchedule = text(rawSchedule.id)
    ? {
        timeZone: text(rawSchedule.timezone) || context.timeZone,
        operatingDays: (rawSchedule.operating_days as number[]) ?? defaults.operatingDays,
        sod: {
          required: rawSchedule.sod_required !== false,
          dueTime: text(rawSchedule.sod_due_time).slice(0, 5) || defaults.sod.dueTime,
          graceMinutes: number(rawSchedule.sod_grace_minutes, defaults.sod.graceMinutes),
          requiredViews: strings(rawSchedule.sod_required_views, defaults.sod.requiredViews),
        },
        eod: {
          required: rawSchedule.eod_required !== false,
          dueTime: text(rawSchedule.eod_due_time).slice(0, 5) || defaults.eod.dueTime,
          graceMinutes: number(rawSchedule.eod_grace_minutes, defaults.eod.graceMinutes),
          requiredViews: strings(rawSchedule.eod_required_views, defaults.eod.requiredViews),
        },
      }
    : defaults

  const imagesByInspection = new Map<string, Row[]>()
  for (const raw of imagesResult.data ?? []) {
    const image = record(raw)
    const inspectionId = text(image.inspection_id)
    if (inspectionId)
      imagesByInspection.set(inspectionId, [...(imagesByInspection.get(inspectionId) ?? []), image])
  }
  const vehicles: ComplianceVehicle[] = (vehiclesResult.data ?? []).map((raw) => {
    const row = record(raw)
    const metadata = record(row.metadata)
    const assignedDriver = record(metadata.assignedDriver ?? metadata.assigned_driver)
    return {
      id: text(row.id),
      label: text(row.name) || `Van ${text(row.van_number)}` || 'Unidentified van',
      status: text(row.status) || 'active',
      expectedDriver: text(assignedDriver.displayName ?? assignedDriver.display_name)
        ? {
            id: text(assignedDriver.id) || null,
            displayName: text(assignedDriver.displayName ?? assignedDriver.display_name),
          }
        : null,
    }
  })
  const submissions: ComplianceSubmission[] = (inspectionsResult.data ?? []).map((raw) => {
    const row = record(raw)
    const metadata = record(row.metadata)
    const submittedAt = text(row.slack_upload_at) || text(row.created_at)
    const period = getInspectionPeriod(submittedAt, schedule.timeZone)
    return {
      id: text(row.id),
      vanId: text(row.van_id) || null,
      inspectionType: period.period,
      submittedAt,
      status: text(row.status),
      reviewStatus: text(row.review_status),
      uploader: record(row.driver_snapshot),
      identityMismatch:
        metadata.vehicleMismatch === true
          ? 'wrong_van'
          : metadata.inspectionTypeMismatch === true
            ? 'wrong_inspection_type'
            : null,
      incomplete: metadata.partial === true,
      images: (imagesByInspection.get(text(row.id)) ?? []).map((image) => {
        const imageMetadata = record(image.metadata)
        return {
          view: text(image.image_role) || null,
          status: text(image.status),
          qualityStatus: text(imageMetadata.qualityStatus ?? imageMetadata.quality_status) || null,
        }
      }),
    }
  })

  return {
    ...getInspectionComplianceForTenant({
      from: input.from,
      to: input.to,
      now: input.now ?? new Date(),
      schedule,
      vehicles,
      submissions,
      excuses: (excusesResult.data ?? []).map((raw) => {
        const row = record(raw)
        return {
          vanId: text(row.van_id),
          slotDate: text(row.slot_date),
          slotType: text(row.slot_type) as 'SOD' | 'EOD',
          reason: text(row.reason),
        }
      }),
    }),
    schedule,
    configured: Boolean(text(rawSchedule.id)),
  }
}
