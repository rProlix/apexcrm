import { NextRequest, NextResponse } from 'next/server'
import { recordCommandAudit } from '@/lib/command-center/audit'
import { CommandCenterAccessError, requireCommandCenterContext } from '@/lib/command-center/context'
import {
  loadReportData,
  renderReportCsv,
  renderReportPdf,
  type ReportFormat,
} from '@/lib/command-center/reports'
import { emitNotificationEvent } from '@/lib/command-center/notifications'

export async function GET(request: NextRequest) {
  try {
    const context = await requireCommandCenterContext('view_reports')
    const reportKey = request.nextUrl.searchParams.get('report') ?? ''
    const format = request.nextUrl.searchParams.get('format') as ReportFormat
    const dateFrom = request.nextUrl.searchParams.get('from') ?? ''
    const dateTo = request.nextUrl.searchParams.get('to') ?? ''
    if (!['pdf', 'csv'].includes(format)) {
      return NextResponse.json({ error: 'Choose PDF or CSV.' }, { status: 400 })
    }

    const { definition, data } = await loadReportData(context, reportKey, dateFrom, dateTo)
    if (!definition.formats.includes(format)) {
      return NextResponse.json({ error: 'That format is not available.' }, { status: 400 })
    }

    const generatedAt = new Intl.DateTimeFormat('en-US', {
      timeZone: context.timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date())
    const bytes =
      format === 'csv'
        ? renderReportCsv(data)
        : renderReportPdf({
            tenantName: context.tenantConfig.tenant.name,
            reportName: definition.displayName,
            dateFrom,
            dateTo,
            generatedAt,
            generatedBy: context.user.email,
            data,
          })

    const { error: historyError } = await context.db.from('command_report_runs').insert({
      tenant_id: context.tenantId,
      report_key: definition.key,
      module_key: definition.moduleKey,
      format,
      date_from: dateFrom,
      date_to: dateTo,
      generated_by: context.user.id,
      row_count: data.rows.length,
      status: 'generated',
    })
    if (historyError) {
      console.error('[reports] history write failed', { code: historyError.code })
    }
    await recordCommandAudit({
      tenantId: context.tenantId,
      actorUserId: context.user.id,
      action: 'command_center.report.generated',
      metadata: {
        module_key: definition.moduleKey,
        report_key: definition.key,
        format,
        row_count: data.rows.length,
        title: definition.displayName,
      },
    })
    await recordCommandAudit({
      tenantId: context.tenantId,
      actorUserId: context.user.id,
      action: 'command_center.report.downloaded',
      metadata: {
        module_key: definition.moduleKey,
        report_key: definition.key,
        format,
        row_count: data.rows.length,
        title: definition.displayName,
      },
    })
    await emitNotificationEvent(context, {
      eventType: 'reports.generated',
      moduleKey: 'core',
      sourceRecordType: 'report',
      sourceRecordId: `${definition.key}:${dateFrom}:${dateTo}`,
      title: `${definition.displayName} is ready`,
      body: `${data.rows.length} records were included in the ${format.toUpperCase()} report.`,
      sourceHref: `/reports?report=${encodeURIComponent(definition.key)}&from=${dateFrom}&to=${dateTo}`,
      recordOwnerUserId: context.user.id,
    })

    const responseBody = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer
    return new NextResponse(responseBody, {
      headers: {
        'Content-Type': format === 'pdf' ? 'application/pdf' : 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${definition.filename(dateFrom, dateTo)}.${format}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const status = error instanceof CommandCenterAccessError ? error.status : 400
    const message =
      error instanceof CommandCenterAccessError
        ? error.message
        : error instanceof Error &&
            /^(Choose|Report start date|Report date ranges|That report)/.test(error.message)
          ? error.message
          : 'We couldn’t generate this report.'
    return NextResponse.json({ error: message }, { status })
  }
}
