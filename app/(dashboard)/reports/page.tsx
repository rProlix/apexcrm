import Link from 'next/link'
import { FileBarChart, FileSpreadsheet, FileText } from 'lucide-react'
import { requireCommandCenterContext } from '@/lib/command-center/context'
import { getAvailableReports, loadReportData } from '@/lib/command-center/reports'
import { formatInTenantTime, getTenantDayRange } from '@/lib/command-center/time'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState, ErrorState } from '@/components/ui/StatePanel'
import { SelectField, TextField } from '@/components/ui/Field'

export const dynamic = 'force-dynamic'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const context = await requireCommandCenterContext('view_reports')
  const params = await searchParams
  const reports = getAvailableReports(context.activeModuleKeys, context.role)
  const today = getTenantDayRange(new Date(), context.timeZone).dateKey
  const monthAgo = getTenantDayRange(
    new Date(Date.now() - 29 * 86_400_000),
    context.timeZone
  ).dateKey
  const reportKey = param(params.report) || reports[0]?.key || ''
  const dateFrom = param(params.from) || monthAgo
  const dateTo = param(params.to) || today
  let preview: Awaited<ReturnType<typeof loadReportData>> | null = null
  let previewError: string | null = null
  if (reportKey) {
    try {
      preview = await loadReportData(context, reportKey, dateFrom, dateTo)
    } catch {
      previewError = 'We couldn’t load this report preview. No values were replaced with zeros.'
    }
  }
  const { data: recentRuns } = await context.db
    .from('command_report_runs')
    .select('id, report_key, format, date_from, date_to, row_count, created_at')
    .eq('tenant_id', context.tenantId)
    .in('module_key', context.activeModuleKeys)
    .order('created_at', { ascending: false })
    .limit(8)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business intelligence"
        title="Reports"
        description="Generate branded reports from active module data. Every export is produced securely within this workspace."
        icon={FileBarChart}
      />

      {reports.length === 0 ? (
        <EmptyState
          title="No reports are available"
          description="No active modules currently provide reports for your role."
        />
      ) : (
        <>
          <form
            className="ui-surface grid gap-3 p-3 sm:grid-cols-2 sm:items-end xl:grid-cols-[minmax(0,2fr)_minmax(9rem,1fr)_minmax(9rem,1fr)_auto]"
            aria-label="Report controls"
          >
            <SelectField
              id="report-type"
              name="report"
              label="Report type"
              defaultValue={reportKey}
              className="sm:col-span-2 xl:col-span-1"
              controlClassName="min-h-10 py-2 text-xs"
            >
              {reports.map((report) => (
                <option key={report.key} value={report.key}>
                  {report.displayName} ({report.moduleKey})
                </option>
              ))}
            </SelectField>
            <TextField
              id="report-date-from"
              name="from"
              label="From"
              type="date"
              defaultValue={dateFrom}
              controlClassName="min-h-10 py-2 text-xs"
            />
            <TextField
              id="report-date-to"
              name="to"
              label="To"
              type="date"
              defaultValue={dateTo}
              controlClassName="min-h-10 py-2 text-xs"
            />
            <button className="ui-button-secondary w-full text-xs sm:col-span-2 xl:col-span-1 xl:w-auto">
              Preview report
            </button>
          </form>

          {previewError && (
            <ErrorState
              title="We couldn’t load this report preview"
              description={previewError}
              compact
            />
          )}

          {preview && (
            <section className="ui-surface p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="ui-eyebrow capitalize">
                    {preview.definition.moduleKey.replace('_', ' ')}
                  </p>
                  <h2 className="ui-section-title">{preview.definition.displayName}</h2>
                  <p className="mt-1 text-sm text-white/45">{preview.definition.description}</p>
                </div>
                <div className="flex gap-2">
                  <DownloadLink
                    reportKey={reportKey}
                    format="pdf"
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    icon={FileText}
                  />
                  <DownloadLink
                    reportKey={reportKey}
                    format="csv"
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    icon={FileSpreadsheet}
                  />
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {preview.data.summary.map((item) => (
                  <div key={item.label} className="ui-surface-muted p-4">
                    <p className="text-xs font-medium text-white/42">{item.label}</p>
                    <p className="mt-1 text-xl font-semibold tabular-nums text-white/85">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="ui-table-wrap mt-5 overflow-x-auto">
                {preview.data.rows.length === 0 ? (
                  <EmptyState
                    title="No report data"
                    description={preview.data.emptyMessage}
                    compact
                    className="border-0"
                  />
                ) : (
                  <table className="ui-table min-w-full text-xs">
                    <thead>
                      <tr>
                        {preview.data.columns.map((column) => (
                          <th key={column.key} className="whitespace-nowrap">
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.data.rows.slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          {preview.data.columns.map((column) => (
                            <td key={column.key} className="whitespace-nowrap">
                              {String(row[column.key] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {preview.data.rows.length > 10 && (
                <p className="mt-3 text-xs text-white/30">
                  Previewing 10 of {preview.data.rows.length} rows. Download for the complete
                  report.
                </p>
              )}
            </section>
          )}
        </>
      )}

      {(recentRuns ?? []).length > 0 && (
        <section>
          <h2 className="ui-section-title mb-3">Recent downloads</h2>
          <div className="ui-surface overflow-hidden">
            {(recentRuns ?? []).map((run, index) => (
              <div
                key={run.id}
                className={`flex items-center justify-between gap-3 p-4 ${index > 0 ? 'border-t border-white/[0.06]' : ''}`}
              >
                <div>
                  <p className="text-sm text-white/60">
                    {reports.find((report) => report.key === run.report_key)?.displayName ??
                      'Report'}
                  </p>
                  <p className="mt-1 text-xs uppercase text-white/25">
                    {run.format} · {run.row_count} rows ·{' '}
                    {formatInTenantTime(run.created_at, context.timeZone)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function DownloadLink({
  reportKey,
  format,
  dateFrom,
  dateTo,
  icon: Icon,
}: {
  reportKey: string
  format: 'pdf' | 'csv'
  dateFrom: string
  dateTo: string
  icon: typeof FileText
}) {
  const href = `/api/reports/download?report=${encodeURIComponent(reportKey)}&format=${format}&from=${encodeURIComponent(dateFrom)}&to=${encodeURIComponent(dateTo)}`
  return (
    <Link href={href} className="ui-button-primary text-xs uppercase">
      <Icon className="h-3.5 w-3.5" />
      {format}
    </Link>
  )
}
function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
