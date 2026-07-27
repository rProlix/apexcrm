import Link from 'next/link'
import { AlertTriangle, CalendarCheck2, CheckCircle2, Clock3, ImageOff, Route } from 'lucide-react'
import type {
  ComplianceMetrics,
  ComplianceSlotResult,
  ComplianceStatus,
} from '@/lib/van-damage/compliance'
import { StatusBadge } from '@/components/ui/StatusBadge'

const STATUS_LABEL: Record<ComplianceStatus, string> = {
  complete: 'Complete',
  missing: 'Missing',
  late: 'Late',
  partial: 'Partial',
  images_missing: 'Images missing',
  analysis_processing: 'Analysis processing',
  analysis_failed: 'Analysis failed',
  needs_review: 'Needs review',
  excused: 'Excused',
  duplicate_submission: 'Duplicate submission',
  wrong_van: 'Wrong van',
  wrong_inspection_type: 'Wrong inspection type',
}

export function ComplianceDashboard({
  slots,
  metrics,
  timeZone,
  statusFilter,
  configured,
}: {
  slots: ComplianceSlotResult[]
  metrics: ComplianceMetrics
  timeZone: string
  statusFilter?: ComplianceStatus
  configured: boolean
}) {
  const visible = statusFilter ? slots.filter((slot) => slot.status === statusFilter) : slots
  const cards: Array<{
    label: string
    value: string | number
    status?: ComplianceStatus
    icon: typeof CheckCircle2
  }> = [
    { label: 'Compliance rate', value: `${metrics.complianceRate}%`, icon: CalendarCheck2 },
    {
      label: 'SOD complete',
      value: slots.filter((slot) => slot.slotType === 'SOD' && slot.status === 'complete').length,
      status: 'complete',
      icon: CheckCircle2,
    },
    {
      label: 'EOD complete',
      value: slots.filter((slot) => slot.slotType === 'EOD' && slot.status === 'complete').length,
      status: 'complete',
      icon: CheckCircle2,
    },
    {
      label: 'Missing',
      value: slots.filter((slot) => slot.status === 'missing').length,
      status: 'missing',
      icon: AlertTriangle,
    },
    {
      label: 'Late',
      value: slots.filter((slot) => slot.status === 'late').length,
      status: 'late',
      icon: Clock3,
    },
    {
      label: 'Images missing',
      value: slots.filter((slot) => slot.status === 'images_missing').length,
      status: 'images_missing',
      icon: ImageOff,
    },
    {
      label: 'Consecutive misses',
      value: slots.filter((slot) => slot.missedStreak >= 2).length,
      icon: Route,
    },
  ]
  const hrefFor = (status?: ComplianceStatus) => (status ? `?status=${status}` : '?')

  return (
    <div className="space-y-6">
      {!configured && (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.07] px-4 py-3 text-sm text-amber-100">
          The default weekday schedule is active. An administrator can customize due times, grace
          periods, operating days, and required views.
        </div>
      )}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7" aria-label="Compliance summary">
        {cards.map(({ label, value, status, icon: Icon }) => (
          <Link
            key={label}
            href={hrefFor(status)}
            className="focus-ring group rounded-2xl border border-white/10 bg-graphite-800 p-4 transition-[transform,border-color,background-color] duration-150 active:scale-[.98] hover:border-brand/25 hover:bg-white/[.045]"
          >
            <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
            <p className="mt-4 text-2xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-xs text-white/45">{label}</p>
          </Link>
        ))}
      </section>
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-graphite-800">
        <div className="border-b border-white/8 px-5 py-4">
          <h2 className="font-semibold text-white">Expected inspection slots</h2>
          <p className="mt-1 text-xs text-white/40">
            {visible.length} slots · Times shown in {timeZone}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-black/10 text-[10px] uppercase tracking-[.12em] text-white/35">
              <tr>
                {[
                  'Van',
                  'Expected',
                  'Due',
                  'Submitted',
                  'Status',
                  'Images',
                  'Expected inspector',
                  'Uploader',
                  'Streak',
                  'Action',
                ].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/7">
              {visible.map((slot) => (
                <tr key={slot.key} className="align-top text-white/65 hover:bg-white/[.025]">
                  <td className="px-4 py-4 font-medium text-white">{slot.vanLabel}</td>
                  <td className="px-4 py-4">{slot.slotType}</td>
                  <td className="px-4 py-4">{formatTime(slot.dueAt, timeZone)}</td>
                  <td className="px-4 py-4">
                    {slot.submittedAt ? formatTime(slot.submittedAt, timeZone) : 'Not received'}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={STATUS_LABEL[slot.status]} />
                  </td>
                  <td className="px-4 py-4">
                    <span>
                      {slot.receivedViews.length}/{slot.requiredViews.length}
                    </span>
                    {slot.missingViews.length > 0 && (
                      <p className="mt-1 max-w-40 text-xs text-amber-200/75">
                        Missing {slot.missingViews.join(', ')}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-4">{slot.expectedDriver}</td>
                  <td className="px-4 py-4">{slot.actualUploader}</td>
                  <td className="px-4 py-4">{slot.missedStreak || '—'}</td>
                  <td className="px-4 py-4">
                    <Link
                      href={
                        slot.submissionId
                          ? `/dashboard/damage-ai/inspections/${slot.submissionId}`
                          : `/dashboard/vehicles/${slot.vanId}`
                      }
                      className="focus-ring inline-flex min-h-9 items-center rounded-lg border border-white/10 px-3 text-xs font-medium text-white hover:bg-white/5"
                    >
                      {slot.submissionId ? 'Open inspection' : 'Open van'}
                    </Link>
                  </td>
                </tr>
              ))}
              {!visible.length && (
                <tr>
                  <td colSpan={10} className="px-5 py-14 text-center text-white/40">
                    No expected slots match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function formatTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}
