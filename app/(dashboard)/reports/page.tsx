import Link from 'next/link'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { requireCommandCenterContext } from '@/lib/command-center/context'
import { getAvailableReports, loadReportData } from '@/lib/command-center/reports'
import { formatInTenantTime, getTenantDayRange } from '@/lib/command-center/time'

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
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300/70">
          Business intelligence
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">Reports</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          Only reports backed by active-module data are available. Downloads are generated
          server-side and tenant-scoped.
        </p>
      </header>

      {reports.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-white/40">
          No active modules have reports available for your role.
        </div>
      ) : (
        <>
          <form className="grid gap-3 rounded-2xl border border-white/10 bg-graphite-900/60 p-4 md:grid-cols-4">
            <label className="text-xs text-white/40 md:col-span-2">
              Report type
              <select name="report" defaultValue={reportKey} className={inputClass}>
                {reports.map((report) => (
                  <option key={report.key} value={report.key}>
                    {report.displayName} · {report.moduleKey}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-white/40">
              From
              <input name="from" type="date" defaultValue={dateFrom} className={inputClass} />
            </label>
            <label className="text-xs text-white/40">
              To
              <input name="to" type="date" defaultValue={dateTo} className={inputClass} />
            </label>
            <button className="rounded-lg bg-white/8 px-3 py-2 text-xs font-medium text-white/65 hover:bg-white/12">
              Preview report
            </button>
          </form>

          {previewError && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-200/75"
            >
              {previewError}
            </div>
          )}

          {preview && (
            <section className="rounded-2xl border border-white/10 bg-graphite-900/60 p-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                <div>
                  <p className="text-xs capitalize text-white/30">{preview.definition.moduleKey}</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">
                    {preview.definition.displayName}
                  </h2>
                  <p className="mt-1 text-xs text-white/40">{preview.definition.description}</p>
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
                  <div key={item.label} className="rounded-xl border border-white/8 p-3">
                    <p className="text-2xs uppercase tracking-wide text-white/25">{item.label}</p>
                    <p className="mt-1 text-lg font-semibold text-white/75">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 overflow-x-auto">
                {preview.data.rows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-xs text-white/35">
                    {preview.data.emptyMessage}
                  </div>
                ) : (
                  <table className="min-w-full text-left text-xs">
                    <thead>
                      <tr>
                        {preview.data.columns.map((column) => (
                          <th
                            key={column.key}
                            className="border-b border-white/10 px-3 py-2 font-medium text-white/35"
                          >
                            {column.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.data.rows.slice(0, 10).map((row, index) => (
                        <tr key={index}>
                          {preview.data.columns.map((column) => (
                            <td
                              key={column.key}
                              className="border-b border-white/5 px-3 py-2.5 text-white/55"
                            >
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
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/30">
            Recent downloads
          </h2>
          <div className="rounded-2xl border border-white/10 bg-graphite-900/60">
            {(recentRuns ?? []).map((run, index) => (
              <div
                key={run.id}
                className={`flex items-center justify-between gap-3 p-4 ${index > 0 ? 'border-t border-white/5' : ''}`}
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
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-lg bg-gold-500 px-3 py-2 text-xs font-semibold uppercase text-graphite-950"
    >
      <Icon className="h-3.5 w-3.5" />
      {format}
    </Link>
  )
}
const inputClass =
  'mt-1.5 w-full rounded-lg border border-white/10 bg-graphite-950 px-2.5 py-2 text-xs text-white'
function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}
