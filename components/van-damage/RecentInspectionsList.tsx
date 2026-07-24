import Link from 'next/link'
import { AlertTriangle, ArrowRight, ImageIcon, ShieldAlert, UserRound } from 'lucide-react'
import { InspectionPeriodBadge } from './InspectionPeriodBadge'
import { SignedDamageImage } from './SignedDamageImage'
import { StatusBadge } from './StatusBadge'
import {
  formatInspectionTimestamp,
  getInspectionDateGroup,
  type InspectionDateGroup,
} from '@/lib/van-damage/inspection-period'
import type { InspectionSearchRow } from '@/lib/van-damage/inspection-search'

const groupOrder: InspectionDateGroup[] = ['Today', 'Yesterday', 'Earlier this week', 'Older']
const processingStatuses = new Set(['queued', 'processing', 'analyzing'])

function detailHref(row: InspectionSearchRow, businessId: string, returnHref: string) {
  const params = new URLSearchParams({
    businessId,
    returnTo: returnHref,
  })
  return `/dashboard/damage-ai/inspections/${row.id}?${params.toString()}`
}

export function RecentInspectionsList({
  rows,
  total,
  page,
  pageCount,
  timeZone,
  businessId,
  returnHref,
  error = false,
  pagination,
}: {
  rows: InspectionSearchRow[]
  total: number
  page: number
  pageCount: number
  timeZone: string
  businessId: string
  returnHref: string
  error?: boolean
  pagination?: React.ReactNode
}) {
  const grouped = new Map<InspectionDateGroup, InspectionSearchRow[]>()
  for (const row of rows) {
    const group = getInspectionDateGroup(row.uploadAt, timeZone)
    grouped.set(group, [...(grouped.get(group) ?? []), row])
  }

  return (
    <section
      aria-labelledby="recent-inspections-heading"
      className="overflow-hidden rounded-xl border border-white/10 bg-graphite-800"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 px-4 py-4 sm:px-5">
        <div>
          <h2 id="recent-inspections-heading" className="font-semibold text-white">
            Recent Inspections
          </h2>
          <p className="mt-1 text-xs text-white/35">
            {total} result{total === 1 ? '' : 's'} · page {page} of {pageCount} · times in{' '}
            {timeZone}
          </p>
        </div>
        <Link
          href={`/dashboard/damage-ai?businessId=${encodeURIComponent(businessId)}`}
          className="focus-ring rounded-lg px-3 py-2 text-xs font-medium text-gold-300 hover:bg-gold-400/10"
        >
          View all inspections
        </Link>
      </div>

      {error ? (
        <div role="alert" className="p-8 text-center">
          <AlertTriangle className="mx-auto h-6 w-6 text-amber-300" />
          <p className="mt-3 text-sm font-medium text-white">
            We couldn’t load recent inspections.
          </p>
          <p className="mt-1 text-xs text-white/40">Refresh the page to try again.</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="p-10 text-center">
          <ImageIcon className="mx-auto h-7 w-7 text-white/20" />
          <p className="mt-3 text-sm font-medium text-white">
            No inspections have been received yet.
          </p>
          <p className="mt-1 text-xs text-white/40">
            New image uploads from a configured inspection channel will appear here.
          </p>
        </div>
      ) : (
        <div>
          {groupOrder.map((group) => {
            const groupRows = grouped.get(group)
            if (!groupRows?.length) return null
            return (
              <section
                key={group}
                aria-labelledby={`inspection-group-${group.replaceAll(' ', '-').toLowerCase()}`}
              >
                <h3
                  id={`inspection-group-${group.replaceAll(' ', '-').toLowerCase()}`}
                  className="border-b border-white/8 bg-black/10 px-4 py-2 text-[11px] font-semibold uppercase tracking-[.14em] text-white/35 sm:px-5"
                >
                  {group}
                </h3>
                <div className="divide-y divide-white/8">
                  {groupRows.map((inspection, index) => {
                    const newDamage = inspection.newDamageCount ?? 0
                    const existingDamage = inspection.existingDamageCount ?? 0
                    const needsReview =
                      inspection.status === 'needs_review' ||
                      inspection.reviewStatus === 'in_review'
                    const failed = inspection.status === 'failed'
                    const processing = processingStatuses.has(inspection.status)
                    const href = detailHref(inspection, businessId, returnHref)
                    return (
                      <article
                        key={inspection.id}
                        className="grid gap-4 px-4 py-4 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:px-5 lg:grid-cols-[7.5rem_minmax(0,1fr)_auto] lg:items-center"
                      >
                        <div className="overflow-hidden rounded-xl">
                          {inspection.latestImageId ? (
                            <SignedDamageImage
                              imageId={inspection.latestImageId}
                              businessId={businessId}
                              alt={`Inspection thumbnail for ${inspection.vanNumber ? `Van ${inspection.vanNumber}` : inspection.vanName}`}
                              eager={index < 2 && group === 'Today'}
                              sizes="120px"
                            />
                          ) : (
                            <div className="flex aspect-video items-center justify-center border border-dashed border-white/10 bg-white/[.02] text-white/25">
                              <ImageIcon
                                aria-label="No inspection thumbnail available"
                                className="h-5 w-5"
                              />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-semibold text-white">
                              {inspection.vanNumber
                                ? `Van ${inspection.vanNumber}`
                                : inspection.vanName}
                            </p>
                            <InspectionPeriodBadge
                              timestamp={inspection.uploadAt}
                              timeZone={timeZone}
                              showLabel
                            />
                            <StatusBadge status={inspection.status} />
                            {inspection.hasLevel3 && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-[10px] font-medium text-red-200">
                                <ShieldAlert className="h-3 w-3" />
                                Level 3
                              </span>
                            )}
                            {needsReview && (
                              <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2.5 py-1 text-[10px] font-medium text-amber-200">
                                Needs review
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-white/45">
                            {formatInspectionTimestamp(inspection.uploadAt, { timeZone })} ·{' '}
                            {inspection.inspectionNumber}
                          </p>
                          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                            <span className="inline-flex items-center gap-1.5">
                              <UserRound className="h-3.5 w-3.5 text-white/30" />
                              {inspection.driverName}
                            </span>
                            <span>
                              {inspection.imageCount} image{inspection.imageCount === 1 ? '' : 's'}
                            </span>
                            {newDamage > 0 ? (
                              <span className="font-medium text-amber-200">
                                New damage: {newDamage}
                              </span>
                            ) : (
                              <span className="text-emerald-300">No new damage</span>
                            )}
                            {existingDamage > 0 && (
                              <span>Existing damage observed: {existingDamage}</span>
                            )}
                          </div>
                          {processing && (
                            <p className="mt-2 text-xs text-violet-200">
                              Images received. Automated analysis is in progress.
                            </p>
                          )}
                          {failed && (
                            <p className="mt-2 max-w-2xl text-xs leading-5 text-red-200">
                              Automated analysis could not be completed. The inspection was saved
                              and can be reviewed manually.
                            </p>
                          )}
                        </div>

                        <div className="sm:col-start-2 lg:col-start-auto">
                          <Link
                            href={href}
                            className="focus-ring inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-white/10 px-4 text-sm font-medium text-white/75 hover:bg-white/5 lg:w-auto"
                          >
                            {needsReview ? 'Review findings' : 'View inspection'}
                            <ArrowRight className="ml-2 h-4 w-4" />
                          </Link>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
      {pagination}
    </section>
  )
}
