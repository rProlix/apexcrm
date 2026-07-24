import { hasPermission } from '@/lib/auth/permissions'
import type { AnyRole } from '@/lib/auth/types'
import { getTenantDateRange } from './time'
import type { CommandCenterContext } from './context'

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
    table: 'van_damage_inspections',
    select: 'id, van_id, title, status, review_status, image_count, damage_count, created_at',
    dateColumn: 'created_at',
    map: (row, context) => ({
      created_at: formatDate(row.created_at, context.timeZone),
      vehicle:
        text(row.title) || (row.van_id ? `Vehicle ${text(row.van_id).slice(0, 8)}` : 'Unassigned'),
      status: text(row.review_status || row.status),
      images: number(row.image_count),
      damage: number(row.damage_count),
    }),
    summary: (rows) => [
      { label: 'Inspections', value: rows.length },
      {
        label: 'Needs review',
        value: rows.filter((row) => /review|pending/i.test(text(row.status))).length,
      },
    ],
  }),
  fleet_damage_by_van: report({
    key: 'fleet_damage_by_van',
    moduleKey: 'damage_ai',
    displayName: 'Damage by Van',
    description: 'Detected damage grouped by inspection and vehicle.',
    columns: [
      ['created_at', 'Detected'],
      ['inspection', 'Inspection'],
      ['area', 'Vehicle area'],
      ['type', 'Damage type'],
      ['severity', 'Severity'],
      ['confidence', 'Confidence'],
    ],
    emptyMessage: 'No damage findings were recorded in this period.',
    table: 'van_damage_items',
    select: 'id, inspection_id, vehicle_area, damage_type, severity, confidence, created_at',
    dateColumn: 'created_at',
    map: (row, context) => ({
      created_at: formatDate(row.created_at, context.timeZone),
      inspection: `Inspection ${text(row.inspection_id).slice(0, 8)}`,
      area: text(row.vehicle_area) || 'Unspecified',
      type: text(row.damage_type) || 'Unspecified',
      severity: text(row.severity) || 'Unspecified',
      confidence:
        row.confidence === null || row.confidence === undefined
          ? 'Not available'
          : `${Math.round(number(row.confidence) * 100)}%`,
    }),
    summary: (rows) => [
      { label: 'Damage findings', value: rows.length },
      {
        label: 'Severe findings',
        value: rows.filter((row) => /3|severe|critical/i.test(text(row.severity))).length,
      },
    ],
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
    table: 'fleet_maintenance_items',
    select:
      'id, maintenance_number, title, status, van_id, estimated_cost, actual_cost, currency, reported_at',
    dateColumn: 'reported_at',
    map: (row, context) => ({
      reported_at: formatDate(row.reported_at, context.timeZone),
      item: `#${number(row.maintenance_number)} ${text(row.title)}`,
      status: text(row.status),
      vehicle: row.van_id ? `Vehicle ${text(row.van_id).slice(0, 8)}` : 'Unassigned',
      estimated: formatDecimalMoney(row.estimated_cost, text(row.currency) || 'USD'),
      actual: formatDecimalMoney(row.actual_cost, text(row.currency) || 'USD'),
    }),
    summary: (rows) => [
      { label: 'Maintenance items', value: rows.length },
      {
        label: 'Actual cost',
        value: formatDecimalMoney(
          rows.reduce((sum, row) => sum + number(row.actual_cost), 0),
          'USD'
        ),
      },
    ],
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
    table: 'van_damage_inspections',
    select: 'id, slack_user_id, van_id, image_count, status, created_at',
    dateColumn: 'created_at',
    map: (row, context) => ({
      created_at: formatDate(row.created_at, context.timeZone),
      driver: text(row.slack_user_id) || 'Unknown uploader',
      inspection: `Inspection ${text(row.id).slice(0, 8)}`,
      vehicle: row.van_id ? `Vehicle ${text(row.van_id).slice(0, 8)}` : 'Unassigned',
      images: number(row.image_count),
      status: text(row.status),
    }),
    summary: (rows) => [
      { label: 'Uploads', value: rows.length },
      {
        label: 'Known uploaders',
        value: new Set(rows.map((row) => row.slack_user_id).filter(Boolean)).size,
      },
    ],
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
    input.tenantName,
    input.reportName,
    `Date range: ${input.dateFrom} through ${input.dateTo}`,
    `Generated: ${input.generatedAt} by ${input.generatedBy}`,
    '',
    ...input.data.summary.map((item) => `${item.label}: ${item.value}`),
    '',
    input.data.columns.map((column) => column.label).join(' | '),
    ...input.data.rows.map((row) =>
      input.data.columns.map((column) => displayCell(row[column.key])).join(' | ')
    ),
  ]
  if (input.data.rows.length === 0) lines.push(input.data.emptyMessage)
  lines.push('', 'Generated securely by the business command center.')
  return buildTextPdf(lines)
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

interface UntypedReportQuery {
  select(columns: string): UntypedReportQuery
  eq(column: string, value: unknown): UntypedReportQuery
  gte(column: string, value: string): UntypedReportQuery
  lt(column: string, value: string): UntypedReportQuery
  limit(count: number): Promise<{
    data: Array<Record<string, unknown>> | null
    error: { code: string } | null
  }>
}

function untypedFrom(context: CommandCenterContext, table: string): UntypedReportQuery {
  return (context.db as unknown as { from(tableName: string): UntypedReportQuery }).from(table)
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

function buildTextPdf(lines: string[]): Uint8Array {
  const pages = chunk(lines.map(asciiText), 46)
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
