import { getInspectionPeriod } from '@/lib/van-damage/inspection-period'

export function InspectionPeriodBadge({
  timestamp,
  timeZone,
  showLabel = false,
  className = '',
}: {
  timestamp: string | null | undefined
  timeZone: string
  showLabel?: boolean
  className?: string
}) {
  const period = getInspectionPeriod(timestamp, timeZone)
  const classes =
    period.period === 'SOD'
      ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
      : period.period === 'EOD'
        ? 'border-orange-400/25 bg-orange-400/10 text-orange-100'
        : 'border-white/10 bg-white/[.04] text-white/45'
  const dot =
    period.period === 'SOD'
      ? 'bg-emerald-300'
      : period.period === 'EOD'
        ? 'bg-orange-300'
        : 'bg-white/30'
  return (
    <span
      aria-label={period.ariaLabel}
      title={`${period.label} (${period.timeZone})`}
      className={`inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-medium ${classes} ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>{period.shortLabel}</span>
      {showLabel && <span className="hidden sm:inline">{period.label}</span>}
    </span>
  )
}
