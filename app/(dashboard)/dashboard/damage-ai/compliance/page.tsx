export const dynamic = 'force-dynamic'

import { PageHeader } from '@/components/ui/PageHeader'
import { ComplianceDashboard } from '@/components/van-damage/ComplianceDashboard'
import { requireCommandCenterContext, assertActiveModule } from '@/lib/command-center/context'
import { loadInspectionCompliance } from '@/lib/server/van-damage/compliance'
import type { ComplianceStatus } from '@/lib/van-damage/compliance'

export const metadata = { title: 'Inspection Compliance — NexoraNow' }

const STATUSES = new Set<ComplianceStatus>([
  'complete',
  'missing',
  'late',
  'partial',
  'images_missing',
  'analysis_processing',
  'analysis_failed',
  'needs_review',
  'excused',
  'duplicate_submission',
  'wrong_van',
  'wrong_inspection_type',
])

export default async function InspectionCompliancePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string; status?: string }>
}) {
  const context = await requireCommandCenterContext('view_dashboard')
  assertActiveModule(context, 'damage_ai')
  const query = await searchParams
  const today = localDate(new Date(), context.timeZone)
  const from = validDate(query.from ?? query.date) ?? today
  const to = validDate(query.to) ?? from
  const statusFilter = STATUSES.has(query.status as ComplianceStatus)
    ? (query.status as ComplianceStatus)
    : undefined
  const result = await loadInspectionCompliance(context, { from, to })

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Fleet operations"
        title="Inspection Compliance"
        description="Every expected SOD and EOD slot, reconciled against real submissions, required images, timing, and analysis state."
      />
      <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-white/10 bg-graphite-800 p-4">
        <label className="text-xs text-white/50">
          From
          <input
            name="from"
            type="date"
            defaultValue={from}
            className="mt-1 block rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="text-xs text-white/50">
          To
          <input
            name="to"
            type="date"
            defaultValue={to}
            className="mt-1 block rounded-lg border border-white/10 bg-black/15 px-3 py-2 text-sm text-white"
          />
        </label>
        {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
        <button className="focus-ring min-h-10 rounded-xl bg-brand px-4 text-sm font-semibold text-[var(--tenant-accent-foreground)] active:scale-[.98]">
          Apply dates
        </button>
      </form>
      <ComplianceDashboard
        slots={result.slots}
        metrics={result.metrics}
        timeZone={context.timeZone}
        statusFilter={statusFilter}
        configured={result.configured}
      />
    </div>
  )
}

function validDate(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

function localDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}
