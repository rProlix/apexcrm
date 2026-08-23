import { cn } from '@/lib/utils'
import { PremiumLineChart } from '@/components/charts/PremiumLineChart'
import { UsageCostWidget } from '@/components/widgets/UsageCostWidget'
import { UsageChartWidget } from '@/components/widgets/UsageChartWidget'
import { SectionHeader } from '@/components/ui/SectionHeader'
import type {
  DashboardLayout,
  WidgetConfig,
  WidgetData,
  WidgetDataStat,
  WidgetDataChart,
  WidgetDataUsage,
  WidgetDataError,
} from '@/lib/dashboard/types'

interface DashboardRendererProps {
  layout: DashboardLayout
  widgetDataMap: Record<string, WidgetData>
  /** When provided, wraps each widget in a draggable handle */
  renderWidget?: (widgetConfig: WidgetConfig, content: React.ReactNode) => React.ReactNode
}

// ─── Individual widget renderers ────────────────────────────────

function StatWidgetInner({ data }: { data: WidgetDataStat }) {
  const accent = data.color ?? 'text-brand'

  return (
    <div className="flex min-h-24 flex-col justify-between">
      <p className="truncate text-xs font-medium text-white/45">{data.label}</p>
      {data.value === 0 || data.value === '' ? (
        <div className="mt-5">
          <p className="text-3xl font-semibold tracking-[-0.04em] text-white/15 tabular-nums">—</p>
          <p className="mt-1.5 text-xs text-white/25">{data.emptyMessage ?? 'No data yet'}</p>
        </div>
      ) : (
        <div className="mt-5 flex items-end justify-between gap-3">
          <p className="text-3xl font-semibold tracking-[-0.045em] text-white tabular-nums">
            {data.formatted}
          </p>
          <span
            className={cn(
              'mb-1 h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_12px_currentColor]',
              accent
            )}
          />
        </div>
      )}
    </div>
  )
}

function ErrorWidgetInner({ data }: { data: WidgetDataError }) {
  return (
    <div>
      <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3 truncate">
        {data.label}
      </p>
      <p className="text-sm text-red-300">{data.message}</p>
    </div>
  )
}

function ChartWidgetInner({ data }: { data: WidgetDataChart }) {
  const hasData = data.points.some((p) => p.value > 0)
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-white/35 uppercase tracking-widest truncate">
          {data.label}
        </p>
        <span className="text-xs text-white/20 shrink-0 ml-2">30d</span>
      </div>
      {hasData ? (
        <PremiumLineChart
          data={data.points}
          color={data.color ?? '#c9a84c'}
          height={130}
          gradientId={`line_${data.label.replace(/\s+/g, '_')}`}
        />
      ) : (
        <div className="h-32 flex items-center justify-center text-xs text-white/20">
          No data for this period
        </div>
      )}
    </div>
  )
}

function WidgetShell({
  config: _config,
  children,
  wide = false,
}: {
  config: WidgetConfig
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className={cn(wide && 'col-span-full sm:col-span-2')}>
      <div
        className={cn(
          'ui-kpi-tile relative h-full overflow-hidden rounded-2xl p-5',
          'premium-panel premium-border transition-colors duration-200 hover:border-white/[0.13]'
        )}
      >
        {children}
      </div>
    </div>
  )
}

function renderWidgetContent(config: WidgetConfig, data: WidgetData | undefined) {
  if (!data) {
    return (
      <div>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-2">{config.key}</p>
        <p className="text-white/20 text-sm">Widget unavailable</p>
      </div>
    )
  }

  if (data.type === 'stat') return <StatWidgetInner data={data as WidgetDataStat} />
  if (data.type === 'chart') return <ChartWidgetInner data={data as WidgetDataChart} />
  if (data.type === 'error') return <ErrorWidgetInner data={data as WidgetDataError} />
  if (data.type === 'usage') {
    return config.key === 'widget_usage_chart' ? (
      <UsageChartWidget data={data as unknown as WidgetDataChart} />
    ) : (
      <UsageCostWidget data={data as WidgetDataUsage} />
    )
  }
  return null
}

// ─── Main renderer ───────────────────────────────────────────────

export function DashboardRenderer({ layout, widgetDataMap, renderWidget }: DashboardRendererProps) {
  const visibleSections = layout.sections.filter((s) => s.widgets.length > 0)

  if (visibleSections.length === 0) {
    return (
      <div className="rounded-2xl premium-panel premium-border p-16 text-center">
        <p className="text-sm font-semibold text-white mb-1">Your dashboard is empty</p>
        <p className="text-xs text-white/35">
          Use the suggestions below to add your first widgets.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-10">
      {layout.sections.map((section) => {
        if (section.widgets.length === 0) return null

        return (
          <section key={section.id}>
            {/* Section header */}
            <SectionHeader
              title={section.title}
              meta={
                <span>
                  {section.widgets.length} signal{section.widgets.length !== 1 ? 's' : ''}
                </span>
              }
              className="mb-5"
            />

            {/* Widget grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {section.widgets.map((widgetConfig) => {
                const data = widgetDataMap[widgetConfig.key]
                const isWide = widgetConfig.type === 'chart' || widgetConfig.type === 'usage'
                const content = (
                  <WidgetShell config={widgetConfig} wide={isWide}>
                    {renderWidgetContent(widgetConfig, data)}
                  </WidgetShell>
                )

                return renderWidget ? (
                  renderWidget(widgetConfig, content)
                ) : (
                  <div key={widgetConfig.id}>{content}</div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
