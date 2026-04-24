'use client'

import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { staggerContainer, fadeUp, cardHover } from '@/lib/motion'
import { PremiumLineChart } from '@/components/charts/PremiumLineChart'
import { UsageCostWidget } from '@/components/widgets/UsageCostWidget'
import { UsageChartWidget } from '@/components/widgets/UsageChartWidget'
import type {
  DashboardLayout,
  WidgetConfig,
  WidgetData,
  WidgetDataStat,
  WidgetDataChart,
  WidgetDataUsage,
} from '@/lib/dashboard/types'

interface DashboardRendererProps {
  layout:        DashboardLayout
  widgetDataMap: Record<string, WidgetData>
  /** When provided, wraps each widget in a draggable handle */
  renderWidget?: (widgetConfig: WidgetConfig, content: React.ReactNode) => React.ReactNode
}

// ─── Individual widget renderers ────────────────────────────────

function StatWidgetInner({ data }: { data: WidgetDataStat }) {
  return (
    <div>
      <p className="text-xs font-semibold text-white/35 uppercase tracking-widest mb-3 truncate">
        {data.label}
      </p>
      {(data.value === 0 || data.value === '') ? (
        <div>
          <p className="text-2xl font-bold text-white/15 tabular-nums">—</p>
          <p className="text-xs text-white/25 mt-1.5">No data yet</p>
        </div>
      ) : (
        <p className={cn('text-2xl font-bold tabular-nums tracking-tight', data.color ?? 'text-gold-400')}>
          {data.formatted}
        </p>
      )}
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
  config,
  children,
  wide = false,
}: {
  config: WidgetConfig
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <motion.div
      variants={fadeUp}
      initial="rest"
      whileHover="hover"
      className={cn(wide && 'col-span-full sm:col-span-2')}
    >
      <motion.div
        variants={cardHover}
        className={cn(
          'relative overflow-hidden rounded-2xl p-5 h-full',
          'premium-panel premium-border noise-overlay group',
          'transition-shadow duration-300 hover:shadow-panel-lg',
          'bg-gradient-to-br from-[#0b0b0f] to-[#1a1a22]',
          '[box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.06)]'
        )}
      >
        {children}
        {/* Corner glow */}
        <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-gold-500/5 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-400" />
      </motion.div>
    </motion.div>
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

  if (data.type === 'stat')  return <StatWidgetInner  data={data as WidgetDataStat}  />
  if (data.type === 'chart') return <ChartWidgetInner data={data as WidgetDataChart} />
  if (data.type === 'usage') {
    return config.key === 'widget_usage_chart'
      ? <UsageChartWidget data={data as unknown as WidgetDataChart} />
      : <UsageCostWidget  data={data as WidgetDataUsage} />
  }
  return null
}

// ─── Main renderer ───────────────────────────────────────────────

export function DashboardRenderer({
  layout,
  widgetDataMap,
  renderWidget,
}: DashboardRendererProps) {
  const visibleSections = layout.sections.filter((s) => s.widgets.length > 0)

  if (visibleSections.length === 0) {
    return (
      <motion.div
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="rounded-2xl premium-panel premium-border p-16 text-center"
      >
        <p className="text-sm font-semibold text-white mb-1">Your dashboard is empty</p>
        <p className="text-xs text-white/35">Use the suggestions below to add your first widgets.</p>
      </motion.div>
    )
  }

  return (
    <motion.div
      variants={staggerContainer(0.1)}
      initial="hidden"
      animate="visible"
      className="space-y-10"
    >
      {layout.sections.map((section) => {
        if (section.widgets.length === 0) return null

        return (
          <motion.section key={section.id} variants={fadeUp}>
            {/* Section header */}
            <div className="flex items-center gap-3 mb-5">
              <h2 className="text-xs font-semibold text-white/35 uppercase tracking-widest">
                {section.title}
              </h2>
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-2xs text-white/20">{section.widgets.length} widget{section.widgets.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Widget grid */}
            <motion.div
              variants={staggerContainer(0.06)}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            >
              {section.widgets.map((widgetConfig) => {
                const data    = widgetDataMap[widgetConfig.key]
                const isWide  = widgetConfig.type === 'chart' || widgetConfig.type === 'usage'
                const content = (
                  <WidgetShell config={widgetConfig} wide={isWide}>
                    {renderWidgetContent(widgetConfig, data)}
                  </WidgetShell>
                )

                return renderWidget
                  ? renderWidget(widgetConfig, content)
                  : <div key={widgetConfig.id}>{content}</div>
              })}
            </motion.div>
          </motion.section>
        )
      })}
    </motion.div>
  )
}
