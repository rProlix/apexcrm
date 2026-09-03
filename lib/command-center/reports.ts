import { hasPermission } from '@/lib/auth/permissions'
import type { AnyRole } from '@/lib/auth/types'
import { getTenantDateRange } from './time'
import type { CommandCenterContext } from './context'
import { loadInspectionCompliance } from '@/lib/server/van-damage/compliance'
import { formatDriverName } from '@/lib/van-damage/history'

export type ReportFormat = 'pdf' | 'csv'

export interface ReportRow {
  [column: string]: string | number | null
}

export interface ReportData {
  summary: Array<{ label: string; value: string | number }>
  columns: Array<{ key: string; label: string }>
  rows: ReportRow[]
  emptyMessage: string
}

export interface ReportDefinition {
  key: string
  moduleKey: string
  displayName: string
  description: string
  requiredPermission: string
  formats: ReportFormat[]
  dateRange: boolean
  filename: (dateFrom: string, dateTo: string) => string
  load: (
    context: CommandCenterContext,
    range: { dateFrom: string; dateTo: string; startIso: string; endIso: string }
  ) => Promise<ReportData>
}

export const REPORT_REGISTRY: Record<string, ReportDefinition> = {
  fleet_weekly_inspections: report({
    key: 'fleet_weekly_inspections',
    moduleKey: 'damage_ai',
    displayName: 'Weekly Inspections',
    description: 'Inspection volume, review status, and vehicle links.',
    columns: [
      ['created_at', 'Received'],
      ['vehicle', 'Vehicle'],
      ['status', 'Status'],
      ['images', 'Images'],
      ['damage', 'Damage findings'],
    ],
    emptyMessage: 'No inspections were received in this period.',
    customLoad: loadFleetWeeklyInspectionsReport,
  }),
  fleet_damage_by_van: report({
    key: 'fleet_damage_by_van',
    moduleKey: 'damage_ai',
    displayName: 'Damage by Van',
    description: 'Reconciled damage observations grouped by inspection and vehicle.',
    columns: [
      ['created_at', 'Detected'],
      ['vehicle', 'Vehicle'],
      ['inspection', 'Inspection'],
      ['area', 'Vehicle area'],
      ['type', 'Damage type'],
      ['severity', 'Severity'],
      ['confidence', 'Confidence'],
    ],
    emptyMessage: 'No damage findings were recorded in this period.',
    customLoad: loadFleetDamageByVanReport,
  }),
  fleet_maintenance_cost: report({
    key: 'fleet_maintenance_cost',
    moduleKey: 'maintenance',
    displayName: 'Maintenance Cost',
    description: 'Estimated and actual maintenance cost by item.',
    columns: [
      ['reported_at', 'Reported'],
      ['item', 'Maintenance item'],
      ['status', 'Status'],
      ['vehicle', 'Vehicle'],
      ['estimated', 'Estimated'],
      ['actual', 'Actual'],
    ],
    emptyMessage: 'No maintenance items were recorded in this period.',
    customLoad: loadFleetMaintenanceCostReport,
  }),
  fleet_driver_upload_history: report({
    key: 'fleet_driver_upload_history',
    moduleKey: 'damage_ai',
    displayName: 'Driver Upload History',
    description: 'Slack inspection uploads attributed to their uploader.',
    columns: [
      ['created_at', 'Uploaded'],
      ['driver', 'Slack user'],
      ['inspection', 'Inspection'],
      ['vehicle', 'Vehicle'],
      ['images', 'Images'],
      ['status', 'Status'],
    ],
    emptyMessage: 'No attributed inspection uploads were found in this period.',
    customLoad: loadFleetDriverUploadHistoryReport,
  }),
  fleet_unresolved_level_3: report({
    key: 'fleet_unresolved_level_3',
    moduleKey: 'damage_ai',
    displayName: 'Unresolved Level 3 Damage',
    description: 'Open human-confirmation actions for severe vehicle damage.',
    columns: [
      ['detected_at', 'First detected'],
      ['source', 'Inspection'],
      ['title', 'Action'],
      ['priority', 'Priority'],
      ['status', 'Status'],
    ],
    emptyMessage: 'No unresolved Level 3 damage actions were found.',
    customLoad: async (context, range) => {
      const { data, error } = await context.db
        .from('command_action_items')
        .select('source_record_label, title, priority, status, first_detected_at, source_record_id')
        .eq('tenant_id', context.tenantId)
        .eq('module_key', 'damage_ai')
        .eq('action_type', 'level_3_confirmation')
        .in('status', ['open', 'in_progress', 'snoozed'])
        .gte('first_detected_at', range.startIso)
        .lt('first_detected_at', range.endIso)
      if (error) throw new Error(error.code)
      const rows = (data ?? []).map((row) => ({
        detected_at: formatDate(row.first_detected_at, context.timeZone),
        source: row.source_record_label || `Inspection ${row.source_record_id.slice(0, 8)}`,
        title: row.title,
        priority: row.priority,
        status: row.status,
      }))
      return {
        summary: [{ label: 'Unresolved Level 3 actions', value: rows.length }],
        columns: [
          { key: 'detected_at', label: 'First detected' },
          { key: 'source', label: 'Inspection' },
          { key: 'title', label: 'Action' },
          { key: 'priority', label: 'Priority' },
          { key: 'status', label: 'Status' },
        ],
        rows,
        emptyMessage: 'No unresolved Level 3 damage actions were found.',
      }
    },
  }),
  inspection_daily_compliance: report({
    key: 'inspection_daily_compliance',
    moduleKey: 'damage_ai',
    displayName: 'Daily Inspection Compliance',
    description:
      'Expected SOD and EOD slots, including missing submissions and image completeness.',
    columns: [],
    emptyMessage: 'No required inspection slots were scheduled in this period.',
    customLoad: async (context, range) => {
      const result = await loadInspectionCompliance(context, {
        from: range.dateFrom,
        to: range.dateTo,
      })
      return {
        summary: [
          { label: 'Required slots', value: result.metrics.required },
          { label: 'Compliance rate', value: `${result.metrics.complianceRate}%` },
          { label: 'Completion rate', value: `${result.metrics.completionRate}%` },
          { label: 'Image completeness', value: `${result.metrics.imageCompletenessRate}%` },
        ],
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'van', label: 'Van' },
          { key: 'slot', label: 'Expected' },
          { key: 'status', label: 'Status' },
          { key: 'submitted', label: 'Submitted' },
          { key: 'images', label: 'Images' },
          { key: 'expected_driver', label: 'Expected inspector' },
          { key: 'uploader', label: 'Uploader' },
        ],
        rows: result.slots.map((slot) => ({
          date: slot.date,
          van: slot.vanLabel,
          slot: slot.slotType,
          status: slot.status.replaceAll('_', ' '),
          submitted: slot.submittedAt
            ? formatDate(slot.submittedAt, context.timeZone)
            : 'Not received',
          images: `${slot.receivedViews.length}/${slot.requiredViews.length}`,
          expected_driver: slot.expectedDriver,
          uploader: slot.actualUploader,
        })),
        emptyMessage: 'No required inspection slots were scheduled in this period.',
      }
    },
  }),
  damage_before_after_evidence: report({
    key: 'damage_before_after_evidence',
    moduleKey: 'damage_ai',
    displayName: 'Before/After Evidence',
    description: 'Comparison outcomes using stable private evidence references.',
    columns: [],
    emptyMessage: 'No inspection comparisons were completed in this period.',
    customLoad: async (context, range) => {
      const { data, error } = await reportDb(context)
        .from('van_damage_comparison_runs')
        .select(
          'id,van_id,status,overall_confidence,current_inspection_id,prior_inspection_id,created_at'
        )
        .eq('tenant_id', context.tenantId)
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso)
        .order('created_at', { ascending: false })
        .limit(5000)
      if (error) throw new Error(error.code)
      const rows = (data ?? []).map((row: Record<string, unknown>) => ({
        created_at: formatDate(row.created_at, context.timeZone),
        van: `Vehicle ${text(row.van_id).slice(0, 8)}`,
        status: text(row.status).replaceAll('_', ' '),
        confidence:
          row.overall_confidence == null
            ? 'Not available'
            : `${Math.round(number(row.overall_confidence) * 100)}%`,
        current: `Inspection ${text(row.current_inspection_id).slice(0, 8)}`,
        prior: row.prior_inspection_id
          ? `Inspection ${text(row.prior_inspection_id).slice(0, 8)}`
          : 'No comparable prior',
      }))
      return {
        summary: [
          { label: 'Comparisons', value: rows.length },
          {
            label: 'Needs review',
            value: rows.filter((row: ReportRow) => /review/i.test(text(row.status))).length,
          },
        ],
        columns: [
          { key: 'created_at', label: 'Compared' },
          { key: 'van', label: 'Van' },
          { key: 'status', label: 'Status' },
          { key: 'confidence', label: 'Confidence' },
          { key: 'current', label: 'Current evidence' },
          { key: 'prior', label: 'Prior evidence' },
        ],
        rows,
        emptyMessage: 'No inspection comparisons were completed in this period.',
      }
    },
  }),
  repair_verification_results: report({
    key: 'repair_verification_results',
    moduleKey: 'damage_ai',
    displayName: 'Repair Verification Results',
    description: 'Advisory assessment and final human repair decisions.',
    columns: [],
    emptyMessage: 'No repair verifications were recorded in this period.',
    customLoad: async (context, range) => {
      const { data, error } = await reportDb(context)
        .from('van_damage_repair_verifications')
        .select('id,damage_case_id,status,ai_classification,human_decision,reviewed_at,created_at')
        .eq('tenant_id', context.tenantId)
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso)
        .order('created_at', { ascending: false })
        .limit(5000)
      if (error) throw new Error(error.code)
      const rows = (data ?? []).map((row: Record<string, unknown>) => ({
        created_at: formatDate(row.created_at, context.timeZone),
        damage_case: `Case ${text(row.damage_case_id).slice(0, 8)}`,
        status: text(row.status).replaceAll('_', ' '),
        assessment: text(row.ai_classification).replaceAll('_', ' ') || 'Pending',
        human_decision: text(row.human_decision).replaceAll('_', ' ') || 'Human review pending',
        reviewed_at: row.reviewed_at
          ? formatDate(row.reviewed_at, context.timeZone)
          : 'Not reviewed',
      }))
      return {
        summary: [
          { label: 'Verifications', value: rows.length },
          {
            label: 'Human confirmed',
            value: rows.filter(
              (row: ReportRow) => text(row.human_decision) !== 'Human review pending'
            ).length,
          },
        ],
        columns: [
          { key: 'created_at', label: 'Created' },
          { key: 'damage_case', label: 'Damage case' },
          { key: 'status', label: 'Status' },
          { key: 'assessment', label: 'AI assessment' },
          { key: 'human_decision', label: 'Human decision' },
          { key: 'reviewed_at', label: 'Reviewed' },
        ],
        rows,
        emptyMessage: 'No repair verifications were recorded in this period.',
      }
    },
  }),
  store_sales: report({
    key: 'store_sales',
    moduleKey: 'store',
    displayName: 'Store Sales',
    description: 'Orders and recorded sales totals.',
    columns: [
      ['created_at', 'Created'],
      ['order', 'Order'],
      ['status', 'Status'],
      ['total', 'Total'],
    ],
    emptyMessage: 'No store orders were recorded in this period.',
    table: 'orders',
    select: 'id, status, total_amount, created_at',
    dateColumn: 'created_at',
    map: (row, context) => ({
      created_at: formatDate(row.created_at, context.timeZone),
      order: text(row.id).slice(0, 8).toUpperCase(),
      status: text(row.status),
      total: formatDecimalMoney(row.total_amount, 'USD'),
    }),
    summary: (rows) => [
      { label: 'Orders', value: rows.length },
      {
        label: 'Recorded sales',
        value: formatDecimalMoney(
          rows
            .filter((row) => !/cancel|refund|failed/i.test(text(row.status)))
            .reduce((sum, row) => sum + number(row.total_amount), 0),
          'USD'
        ),
      },
    ],
  }),
  store_inventory: report({
    key: 'store_inventory',
    moduleKey: 'store',
    displayName: 'Inventory',
    description: 'Current product inventory and low-stock items.',
    columns: [
      ['product', 'Product'],
      ['inventory', 'Inventory'],
      ['active', 'Active'],
      ['price', 'Price'],
    ],
    emptyMessage: 'No products are available.',
    table: 'products',
    select: 'id, name, inventory_count, is_active, price, currency, created_at',
    dateColumn: null,
    map: (row) => ({
      product: text(row.name),
      inventory: number(row.inventory_count),
      active: row.is_active ? 'Yes' : 'No',
      price: formatDecimalMoney(row.price, text(row.currency) || 'USD'),
    }),
    summary: (rows) => [
      { label: 'Products', value: rows.length },
      {
        label: 'Low stock',
        value: rows.filter((row) => number(row.inventory_count) <= 5).length,
      },
    ],
  }),
  appointments_booking: report({
    key: 'appointments_booking',
    moduleKey: 'appointments',
    displayName: 'Bookings',
    description: 'Appointments scheduled in the selected period.',
    columns: [
      ['starts_at', 'Starts'],
      ['service', 'Service'],
      ['status', 'Status'],
      ['customer', 'Customer'],
    ],
    emptyMessage: 'No appointments were scheduled in this period.',
    table: 'appointments',
    select: 'id, service_name, status, customer_id, starts_at',
    dateColumn: 'starts_at',
    map: (row, context) => ({
      starts_at: formatDate(row.starts_at, context.timeZone),
      service: text(row.service_name),
      status: text(row.status),
      customer: row.customer_id ? `Customer ${text(row.customer_id).slice(0, 8)}` : 'Walk-in',
    }),
    summary: (rows) => [
      { label: 'Appointments', value: rows.length },
      {
        label: 'Completed',
        value: rows.filter((row) => text(row.status) === 'completed').length,
      },
      {
        label: 'No-shows',
        value: rows.filter((row) => /no.?show/i.test(text(row.status))).length,
      },
    ],
  }),
  appointments_no_show: report({
    key: 'appointments_no_show',
    moduleKey: 'appointments',
    displayName: 'No-Show Follow-Up',
    description: 'Appointments marked as no-show.',
    columns: [
      ['starts_at', 'Scheduled'],
      ['service', 'Service'],
      ['customer', 'Customer'],
      ['status', 'Status'],
    ],
    emptyMessage: 'No no-shows were recorded in this period.',
    table: 'appointments',
    select: 'id, service_name, status, customer_id, starts_at',
    dateColumn: 'starts_at',
    filters: { status: 'no_show' },
    map: (row, context) => ({
      starts_at: formatDate(row.starts_at, context.timeZone),
      service: text(row.service_name),
      customer: row.customer_id ? `Customer ${text(row.customer_id).slice(0, 8)}` : 'Unknown',
      status: text(row.status),
    }),
    summary: (rows) => [{ label: 'No-shows', value: rows.length }],
  }),
  payments_activity: report({
    key: 'payments_activity',
    moduleKey: 'payments',
    displayName: 'Payment Activity',
    description: 'Tenant payment records by status.',
    columns: [
      ['created_at', 'Created'],
      ['payment', 'Payment'],
      ['status', 'Status'],
      ['amount', 'Amount'],
    ],
    emptyMessage: 'No payments were recorded in this period.',
    table: 'payments',
    select: 'id, amount_cents, currency, status, created_at',
    dateColumn: 'created_at',
    map: (row, context) => ({
      created_at: formatDate(row.created_at, context.timeZone),
      payment: text(row.id).slice(0, 8).toUpperCase(),
      status: text(row.status),
      amount: formatCents(number(row.amount_cents), text(row.currency) || 'USD'),
    }),
    summary: (rows) => [
      { label: 'Payments', value: rows.length },
      {
        label: 'Completed value',
        value: formatCents(
          rows
            .filter((row) => /completed|paid|succeeded/i.test(text(row.status)))
            .reduce((sum, row) => sum + number(row.amount_cents), 0),
          'USD'
        ),
      },
      {
        label: 'Failed',
        value: rows.filter((row) => text(row.status) === 'failed').length,
      },
    ],
  }),
  payments_failed: report({
    key: 'payments_failed',
    moduleKey: 'payments',
    displayName: 'Failed Payments',
    description: 'Payment records requiring review.',
    columns: [
      ['created_at', 'Created'],
      ['payment', 'Payment'],
      ['amount', 'Amount'],
      ['status', 'Status'],
    ],
    emptyMessage: 'No failed payments were recorded in this period.',
    table: 'payments',
    select: 'id, amount_cents, currency, status, created_at',
    dateColumn: 'created_at',
    filters: { status: 'failed' },
    map: (row, context) => ({
      created_at: formatDate(row.created_at, context.timeZone),
      payment: text(row.id).slice(0, 8).toUpperCase(),
      amount: formatCents(number(row.amount_cents), text(row.currency) || 'USD'),
      status: text(row.status),
    }),
    summary: (rows) => [
      { label: 'Failed payments', value: rows.length },
      {
        label: 'Failed value',
        value: formatCents(
          rows.reduce((sum, row) => sum + number(row.amount_cents), 0),
          'USD'
        ),
      },
    ],
  }),
  customers_activity: report({
    key: 'customers_activity',
    moduleKey: 'customers',
    displayName: 'Customer Activity',
    description: 'Customers added during the selected period.',
    columns: [
      ['created_at', 'Added'],
      ['name', 'Customer'],
      ['email', 'Email'],
      ['phone', 'Phone'],
    ],
    emptyMessage: 'No customers were added in this period.',
    table: 'customers',
    select: 'id, name, email, phone, created_at',
    dateColumn: 'created_at',
    map: (row, context) => ({
      created_at: formatDate(row.created_at, context.timeZone),
      name: text(row.name),
      email: text(row.email) || 'Not provided',
      phone: text(row.phone) || 'Not provided',
    }),
    summary: (rows) => [{ label: 'Customers added', value: rows.length }],
  }),
  customers_lead_follow_up: report({
    key: 'customers_lead_follow_up',
    moduleKey: 'customers',
    displayName: 'Lead Follow-Up',
    description: 'New and follow-up leads from real intake records.',
    columns: [
      ['created_at', 'Received'],
      ['name', 'Lead'],
      ['source', 'Source'],
      ['status', 'Status'],
    ],
    emptyMessage: 'No leads need follow-up in this period.',
    table: 'leads',
    select: 'id, name, source, status, created_at',
    dateColumn: 'created_at',
    map: (row, context) => ({
      created_at: formatDate(row.created_at, context.timeZone),
      name: text(row.name),
      source: text(row.source) || 'Unknown',
      status: text(row.status),
    }),
    summary: (rows) => [
      { label: 'Leads', value: rows.length },
      {
        label: 'Needs follow-up',
        value: rows.filter((row) => /new|follow/i.test(text(row.status))).length,
      },
    ],
  }),
}

export function getAvailableReports(
  activeModuleKeys: Iterable<string>,
  role: AnyRole
): ReportDefinition[] {
  const active = new Set(activeModuleKeys)
  return Object.values(REPORT_REGISTRY)
    .filter((definition) => active.has(definition.moduleKey))
    .filter((definition) => hasPermission(role, definition.requiredPermission))
    .sort(
      (a, b) => a.moduleKey.localeCompare(b.moduleKey) || a.displayName.localeCompare(b.displayName)
    )
}

export async function loadReportData(
  context: CommandCenterContext,
  reportKey: string,
  dateFrom: string,
  dateTo: string
): Promise<{ definition: ReportDefinition; data: ReportData }> {
  const definition = REPORT_REGISTRY[reportKey]
  if (!definition) throw new Error('Unknown report type.')
  if (!context.activeModuleSet.has(definition.moduleKey)) {
    throw new Error('This report belongs to an inactive module.')
  }
  if (!hasPermission(context.role, definition.requiredPermission)) {
    throw new Error('You do not have permission to generate this report.')
  }
  validateDateRange(dateFrom, dateTo)
  const utc = getTenantDateRange(dateFrom, dateTo, context.timeZone)
  const data = await definition.load(context, { dateFrom, dateTo, ...utc })
  return { definition, data }
}

export function renderReportCsv(data: ReportData): Uint8Array {
  const lines = [
    data.columns.map((column) => csvCell(column.label)).join(','),
    ...data.rows.map((row) => data.columns.map((column) => csvCell(row[column.key])).join(',')),
  ]
  return new TextEncoder().encode(`\uFEFF${lines.join('\r\n')}\r\n`)
}

export function renderReportPdf(input: {
  tenantName: string
  reportName: string
  dateFrom: string
  dateTo: string
  generatedAt: string
  generatedBy: string
  data: ReportData
}): Uint8Array {
  const lines = [
    ...input.data.summary.map((item) => `${item.label}: ${item.value}`),
    '',
    input.data.columns.map((column) => column.label).join(' | '),
    ...input.data.rows.map((row) =>
      input.data.columns.map((column) => displayCell(row[column.key])).join(' | ')
    ),
  ]
  if (input.data.rows.length === 0) lines.push(input.data.emptyMessage)
  return buildTextPdf(lines, {
    heading: `${input.tenantName}  |  ${input.reportName}`,
    subheading: `${input.dateFrom} through ${input.dateTo}  |  Generated ${input.generatedAt} by ${input.generatedBy}`,
    footer: 'CONFIDENTIAL  |  Generated securely by the business command center',
  })
}

interface SimpleReportDefinition {
  key: string
  moduleKey: string
  displayName: string
  description: string
  columns: Array<[string, string]>
  emptyMessage: string
  table?: string
  select?: string
  dateColumn?: string | null
  filters?: Record<string, unknown>
  map?: (row: Record<string, unknown>, context: CommandCenterContext) => ReportRow
  summary?: (rows: Array<Record<string, unknown>>) => ReportData['summary']
  customLoad?: ReportDefinition['load']
}

function report(input: SimpleReportDefinition): ReportDefinition {
  return {
    key: input.key,
    moduleKey: input.moduleKey,
    displayName: input.displayName,
    description: input.description,
    requiredPermission: 'view_reports',
    formats: ['pdf', 'csv'],
    dateRange: true,
    filename: (from, to) => `${input.key}-${from}-${to}`,
    load:
      input.customLoad ??
      (async (context, range) => {
        let query = untypedFrom(context, input.table!)
          .select(input.select!)
          .eq('tenant_id', context.tenantId)
        if (input.dateColumn) {
          query = query.gte(input.dateColumn, range.startIso).lt(input.dateColumn, range.endIso)
        }
        for (const [column, value] of Object.entries(input.filters ?? {})) {
          query = query.eq(column, value)
        }
        const { data, error } = await query.limit(5000)
        if (error) throw new Error(error.code)
        const rawRows = data ?? []
        return {
          summary: input.summary?.(rawRows) ?? [{ label: 'Records', value: rawRows.length }],
          columns: input.columns.map(([key, label]) => ({ key, label })),
          rows: rawRows.map((row) => input.map!(row, context)),
          emptyMessage: input.emptyMessage,
        }
      }),
  }
}

async function loadFleetWeeklyInspectionsReport(
  context: CommandCenterContext,
  range: { startIso: string; endIso: string }
): Promise<ReportData> {
  const { data, error } = await reportDb(context)
    .from('van_damage_inspections')
    .select(
      'id,van_id,title,status,review_status,image_count,damage_count,created_at,completed_at,updated_at'
    )
    .eq('tenant_id', context.tenantId)
    .eq('business_id', context.tenantId)
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(error.code)
  const rawRows = (data ?? []) as Array<Record<string, unknown>>
  const inspectionIds = rawRows.map((row) => text(row.id)).filter(Boolean)
  const [imageCounts, damageCounts] = await Promise.all([
    loadInspectionImageCounts(context, inspectionIds),
    loadInspectionDamageCounts(context, inspectionIds),
  ])
  const vehicles = await loadReportVehicles(
    context,
    rawRows.map((row) => text(row.van_id))
  )
  const rows = rawRows.map((row) => ({
    created_at: formatDate(row.created_at, context.timeZone),
    vehicle: vehicleLabel(vehicles, text(row.van_id)) || text(row.title) || 'Unassigned',
    status: text(row.review_status || row.status),
    images: imageCounts.get(text(row.id)) ?? number(row.image_count),
    damage: damageCounts.get(text(row.id)) ?? number(row.damage_count),
  }))
  const latestUpdatedAt = latestTimestamp(rawRows, ['updated_at', 'completed_at', 'created_at'])
  return {
    summary: [
      { label: 'Inspections', value: rows.length },
      {
        label: 'Needs review',
        value: rawRows.filter((row) =>
          /review|pending/i.test(text(row.review_status || row.status))
        ).length,
      },
      {
        label: 'Images received',
        value: rows.reduce((sum, row) => sum + number(row.images), 0),
      },
      {
        label: 'Latest update',
        value: latestUpdatedAt ? formatDate(latestUpdatedAt, context.timeZone) : 'No updates',
      },
    ],
    columns: [
      { key: 'created_at', label: 'Received' },
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'status', label: 'Status' },
      { key: 'images', label: 'Images' },
      { key: 'damage', label: 'Damage findings' },
    ],
    rows,
    emptyMessage: 'No inspections were received in this period.',
  }
}

async function loadFleetDamageByVanReport(
  context: CommandCenterContext,
  range: { startIso: string; endIso: string }
): Promise<ReportData> {
  const { data, error } = await reportDb(context)
    .from('van_damage_cases')
    .select(
      'id,van_id,canonical_region,normalized_damage_type,original_damage_type,effective_damage_type,current_severity,max_observed_severity,effective_severity,lifecycle_status,needs_review,observation_count,first_detected_inspection_id,latest_observed_inspection_id,first_detected_at,last_observed_at,updated_at'
    )
    .eq('tenant_id', context.tenantId)
    .eq('business_id', context.tenantId)
    .gte('updated_at', range.startIso)
    .lt('updated_at', range.endIso)
    .order('updated_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(error.code)
  const rawRows = (data ?? []) as Array<Record<string, unknown>>
  const vehicles = await loadReportVehicles(
    context,
    rawRows.map((row) => text(row.van_id))
  )
  const rows = rawRows.map((row) => ({
    created_at: formatDate(row.last_observed_at, context.timeZone),
    vehicle: vehicleLabel(vehicles, text(row.van_id)) || 'Unassigned',
    inspection: `Inspection ${text(row.latest_observed_inspection_id || row.first_detected_inspection_id).slice(0, 8)}`,
    area: text(row.canonical_region).replaceAll('_', ' ') || 'Unspecified',
    type:
      text(
        row.effective_damage_type || row.normalized_damage_type || row.original_damage_type
      ).replaceAll('_', ' ') || 'Unspecified',
    severity:
      text(row.effective_severity || row.current_severity || row.max_observed_severity).replaceAll(
        '_',
        ' '
      ) || 'Unspecified',
    status: text(row.lifecycle_status).replaceAll('_', ' ') || 'active',
    observations: number(row.observation_count),
  }))
  const activeRows = rawRows.filter(
    (row) => !/repaired|resolved|closed|dismissed/i.test(text(row.lifecycle_status))
  )
  const severeRows = activeRows.filter((row) =>
    /3|severe|critical|level_3|high/i.test(
      text(row.effective_severity || row.current_severity || row.max_observed_severity)
    )
  )
  const latestUpdatedAt = latestTimestamp(rawRows, ['updated_at', 'last_observed_at'])
  return {
    summary: [
      { label: 'Current damage cases', value: rows.length },
      { label: 'Active cases', value: activeRows.length },
      {
        label: 'Active severe cases',
        value: severeRows.length,
      },
      {
        label: 'Vans with damage',
        value: new Set(rawRows.map((row) => text(row.van_id)).filter(Boolean)).size,
      },
      {
        label: 'Latest update',
        value: latestUpdatedAt ? formatDate(latestUpdatedAt, context.timeZone) : 'No updates',
      },
    ],
    columns: [
      { key: 'created_at', label: 'Last observed' },
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'inspection', label: 'Latest inspection' },
      { key: 'area', label: 'Vehicle area' },
      { key: 'type', label: 'Damage type' },
      { key: 'severity', label: 'Current severity' },
      { key: 'status', label: 'Current status' },
      { key: 'observations', label: 'Observations' },
    ],
    rows,
    emptyMessage: 'No damage findings were recorded in this period.',
  }
}

async function loadFleetMaintenanceCostReport(
  context: CommandCenterContext,
  range: { startIso: string; endIso: string }
): Promise<ReportData> {
  const { data, error } = await reportDb(context)
    .from('fleet_maintenance_items')
    .select(
      'id,maintenance_number,title,status,van_id,estimated_cost,actual_cost,currency,reported_at,completed_at,latest_activity_at,updated_at'
    )
    .eq('tenant_id', context.tenantId)
    .eq('business_id', context.tenantId)
    .gte('latest_activity_at', range.startIso)
    .lt('latest_activity_at', range.endIso)
    .order('latest_activity_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(error.code)
  const rawRows = (data ?? []) as Array<Record<string, unknown>>
  const vehicles = await loadReportVehicles(
    context,
    rawRows.map((row) => text(row.van_id))
  )
  const rows = rawRows.map((row) => ({
    reported_at: formatDate(row.latest_activity_at || row.reported_at, context.timeZone),
    item: `#${number(row.maintenance_number)} ${text(row.title)}`,
    status: text(row.status).replaceAll('_', ' '),
    vehicle: vehicleLabel(vehicles, text(row.van_id)) || 'Unassigned',
    estimated: formatDecimalMoney(row.estimated_cost, text(row.currency) || 'USD'),
    actual: formatDecimalMoney(row.actual_cost, text(row.currency) || 'USD'),
  }))
  const activeStatuses = new Set([
    'reported',
    'needs_review',
    'approved',
    'scheduled',
    'waiting_for_parts',
    'in_progress',
    'reopened',
  ])
  const latestUpdatedAt = latestTimestamp(rawRows, [
    'updated_at',
    'latest_activity_at',
    'reported_at',
  ])
  return {
    summary: [
      { label: 'Maintenance items', value: rows.length },
      {
        label: 'Active items',
        value: rawRows.filter((row) => activeStatuses.has(text(row.status))).length,
      },
      {
        label: 'Completed items',
        value: rawRows.filter((row) => text(row.status) === 'completed').length,
      },
      {
        label: 'Actual cost',
        value: formatDecimalMoney(
          rawRows.reduce((sum, row) => sum + number(row.actual_cost), 0),
          'USD'
        ),
      },
      {
        label: 'Latest update',
        value: latestUpdatedAt ? formatDate(latestUpdatedAt, context.timeZone) : 'No updates',
      },
    ],
    columns: [
      { key: 'reported_at', label: 'Reported' },
      { key: 'item', label: 'Maintenance item' },
      { key: 'status', label: 'Status' },
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'estimated', label: 'Estimated' },
      { key: 'actual', label: 'Actual' },
    ],
    rows,
    emptyMessage: 'No maintenance items were recorded in this period.',
  }
}

async function loadFleetDriverUploadHistoryReport(
  context: CommandCenterContext,
  range: { startIso: string; endIso: string }
): Promise<ReportData> {
  const { data, error } = await reportDb(context)
    .from('van_damage_upload_sessions')
    .select(
      'id,inspection_id,van_id,driver_snapshot,slack_user_id,image_count,status,upload_started_at'
    )
    .eq('tenant_id', context.tenantId)
    .eq('business_id', context.tenantId)
    .gte('upload_started_at', range.startIso)
    .lt('upload_started_at', range.endIso)
    .order('upload_started_at', { ascending: false })
    .limit(5000)
  if (error) throw new Error(error.code)
  const rawRows = (data ?? []) as Array<Record<string, unknown>>
  const sessionImageCounts = await loadSessionImageCounts(
    context,
    rawRows.map((row) => text(row.id)).filter(Boolean)
  )
  const vehicles = await loadReportVehicles(
    context,
    rawRows.map((row) => text(row.van_id))
  )
  const rows = rawRows.map((row) => ({
    created_at: formatDate(row.upload_started_at, context.timeZone),
    driver:
      formatDriverName(asRecord(row.driver_snapshot)) ||
      text(row.slack_user_id) ||
      'Unknown uploader',
    inspection: `Inspection ${text(row.inspection_id).slice(0, 8)}`,
    vehicle: vehicleLabel(vehicles, text(row.van_id)) || 'Unassigned',
    images: sessionImageCounts.get(text(row.id)) ?? number(row.image_count),
    status: text(row.status).replaceAll('_', ' '),
  }))
  return {
    summary: [
      { label: 'Uploads', value: rows.length },
      {
        label: 'Known uploaders',
        value: new Set(
          rawRows
            .map(
              (row) => formatDriverName(asRecord(row.driver_snapshot)) || text(row.slack_user_id)
            )
            .filter(Boolean)
        ).size,
      },
    ],
    columns: [
      { key: 'created_at', label: 'Uploaded' },
      { key: 'driver', label: 'Slack user' },
      { key: 'inspection', label: 'Inspection' },
      { key: 'vehicle', label: 'Vehicle' },
      { key: 'images', label: 'Images' },
      { key: 'status', label: 'Status' },
    ],
    rows,
    emptyMessage: 'No attributed inspection uploads were found in this period.',
  }
}

async function loadInspectionImageCounts(
  context: CommandCenterContext,
  inspectionIds: string[]
): Promise<Map<string, number>> {
  if (!inspectionIds.length) return new Map()
  const { data, error } = await reportDb(context)
    .from('van_damage_images')
    .select('inspection_id,status')
    .eq('tenant_id', context.tenantId)
    .eq('business_id', context.tenantId)
    .in('inspection_id', inspectionIds)
    .limit(10000)
  if (error) throw new Error(error.code)
  return countBy(
    (data ?? []).filter((row) => !/failed|deleted|archived/i.test(text(row.status))),
    'inspection_id'
  )
}

async function loadInspectionDamageCounts(
  context: CommandCenterContext,
  inspectionIds: string[]
): Promise<Map<string, number>> {
  if (!inspectionIds.length) return new Map()
  const { data, error } = await reportDb(context)
    .from('van_damage_observations')
    .select('inspection_id')
    .eq('tenant_id', context.tenantId)
    .eq('business_id', context.tenantId)
    .in('inspection_id', inspectionIds)
    .limit(10000)
  if (error) throw new Error(error.code)
  return countBy(data ?? [], 'inspection_id')
}

async function loadSessionImageCounts(
  context: CommandCenterContext,
  sessionIds: string[]
): Promise<Map<string, number>> {
  if (!sessionIds.length) return new Map()
  const { data, error } = await reportDb(context)
    .from('van_damage_images')
    .select('upload_session_id,status')
    .eq('tenant_id', context.tenantId)
    .eq('business_id', context.tenantId)
    .in('upload_session_id', sessionIds)
    .limit(10000)
  if (error) throw new Error(error.code)
  return countBy(
    (data ?? []).filter((row) => !/failed|deleted|archived/i.test(text(row.status))),
    'upload_session_id'
  )
}

function countBy(rows: Array<Record<string, unknown>>, key: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = text(row[key])
    if (!value) continue
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return counts
}

async function loadReportVehicles(
  context: CommandCenterContext,
  rawVehicleIds: string[]
): Promise<Map<string, Record<string, unknown>>> {
  const vehicleIds = [...new Set(rawVehicleIds.filter(Boolean))]
  if (!vehicleIds.length) return new Map()
  const { data, error } = await reportDb(context)
    .from('vehicles')
    .select('id,name,van_number,plate_number')
    .eq('tenant_id', context.tenantId)
    .in('id', vehicleIds)
    .limit(5000)
  if (error) throw new Error(error.code)
  return new Map(((data ?? []) as Array<Record<string, unknown>>).map((row) => [text(row.id), row]))
}

function vehicleLabel(vehicles: Map<string, Record<string, unknown>>, vehicleId: string): string {
  const vehicle = vehicles.get(vehicleId)
  if (!vehicle) return vehicleId ? `Vehicle ${vehicleId.slice(0, 8)}` : ''
  const vanNumber = text(vehicle.van_number)
  const name = text(vehicle.name)
  const plate = text(vehicle.plate_number)
  return [vanNumber ? `Van ${vanNumber}` : name, plate].filter(Boolean).join(' · ')
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function latestTimestamp(rows: Array<Record<string, unknown>>, fields: string[]): string {
  let latest = ''
  for (const row of rows) {
    for (const field of fields) {
      const value = text(row[field])
      if (!value) continue
      if (!latest || Date.parse(value) > Date.parse(latest)) latest = value
    }
  }
  return latest
}

interface UntypedReportQuery {
  select(columns: string): UntypedReportQuery
  eq(column: string, value: unknown): UntypedReportQuery
  gte(column: string, value: string): UntypedReportQuery
  lt(column: string, value: string): UntypedReportQuery
  in(column: string, values: string[]): UntypedReportQuery
  order(column: string, options: { ascending: boolean }): UntypedReportQuery
  limit(count: number): Promise<{
    data: Array<Record<string, unknown>> | null
    error: { code: string } | null
  }>
}

function reportDb(context: CommandCenterContext): { from(tableName: string): UntypedReportQuery } {
  return context.db as unknown as { from(tableName: string): UntypedReportQuery }
}

function untypedFrom(context: CommandCenterContext, table: string): UntypedReportQuery {
  return reportDb(context).from(table)
}

function validateDateRange(from: string, to: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    throw new Error('Choose a valid report date range.')
  }
  const start = new Date(`${from}T00:00:00Z`)
  const end = new Date(`${to}T00:00:00Z`)
  if (start > end) throw new Error('Report start date must be before the end date.')
  if (end.getTime() - start.getTime() > 366 * 86_400_000) {
    throw new Error('Report date ranges are limited to one year.')
  }
}

function buildTextPdf(
  lines: string[],
  chrome: { heading: string; subheading: string; footer: string }
): Uint8Array {
  const bodyPages = chunk(lines.map(asciiText), 39)
  const pages = bodyPages.map((pageLines, index) => [
    asciiText(chrome.heading),
    asciiText(chrome.subheading),
    '________________________________________________________________________________',
    '',
    ...pageLines,
    '',
    `${asciiText(chrome.footer)}  |  Page ${index + 1} of ${bodyPages.length}`,
  ])
  const objects: string[] = []
  const pageObjectIds = pages.map((_, index) => 4 + index * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'

  pages.forEach((pageLines, index) => {
    const pageId = pageObjectIds[index]
    const streamId = pageId + 1
    const commands = [
      'BT',
      '/F1 9 Tf',
      '45 750 Td',
      ...pageLines.flatMap((line, lineIndex) => [
        lineIndex === 0 ? '' : '0 -15 Td',
        `(${escapePdfText(line.slice(0, 112))}) Tj`,
      ]),
      'ET',
    ]
      .filter(Boolean)
      .join('\n')
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`
    objects[streamId] =
      `<< /Length ${Buffer.byteLength(commands, 'latin1')} >>\nstream\n${commands}\nendstream`
  })

  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(body, 'latin1')
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body, 'latin1')
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id += 1) {
    body += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return new Uint8Array(Buffer.from(body, 'latin1'))
}

function csvCell(value: unknown): string {
  const stringValue = displayCell(value)
  return `"${stringValue.replace(/"/g, '""')}"`
}

function displayCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? ''
      : String(value)
}

function number(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatDate(value: unknown, timeZone: string): string {
  const date = new Date(text(value))
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat('en-US', {
        timeZone,
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

function formatCents(value: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(value / 100)
}

function formatDecimalMoney(value: unknown, currency: string): string {
  if (value === null || value === undefined) return 'Not recorded'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(number(value))
}

function asciiText(value: string): string {
  return value.normalize('NFKD').replace(/[^\x20-\x7E]/g, '?')
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function chunk<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]]
  const chunks: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }
  return chunks
}
