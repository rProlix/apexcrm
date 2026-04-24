import { WIDGET_REGISTRY } from '@/lib/dashboard/widgetRegistry'
import type { DashboardLayout } from '@/lib/dashboard/types'

interface SuggestInput {
  enabledModuleKeys: string[]
  currentLayout:     DashboardLayout
}

/**
 * Returns an ordered list of suggested widget keys based on enabled modules.
 * Filters out widgets already present in the current layout.
 * Prioritises high-signal widgets (revenue, fleet, scheduling) first.
 */
export function suggestMetrics({ enabledModuleKeys, currentLayout }: SuggestInput): string[] {
  const alreadyInLayout = new Set(
    currentLayout.sections.flatMap((s) => s.widgets.map((w) => w.key))
  )

  // Priority rules per module combination
  const priorityMap: Record<string, string[]> = {
    vehicles:     ['stat_vehicles_total', 'stat_vehicles_available', 'chart_revenue_trend'],
    payments:     ['stat_revenue_month', 'stat_revenue_total', 'stat_outstanding', 'chart_revenue_trend'],
    appointments: ['stat_appts_upcoming', 'stat_appts_today', 'stat_returning_customers', 'chart_appts_trend'],
    leads:        ['stat_leads_new'],
    rewards:      ['stat_rewards_members'],
  }

  const seen     = new Set<string>()
  const ordered: string[] = []

  // Add suggestions in module priority order
  for (const moduleKey of enabledModuleKeys) {
    for (const widgetKey of (priorityMap[moduleKey] ?? [])) {
      if (!seen.has(widgetKey) && !alreadyInLayout.has(widgetKey)) {
        seen.add(widgetKey)
        ordered.push(widgetKey)
      }
    }
  }

  // Always suggest usage/billing widgets if not present
  for (const key of ['widget_usage_cost', 'widget_usage_chart']) {
    if (!seen.has(key) && !alreadyInLayout.has(key)) {
      seen.add(key)
      ordered.push(key)
    }
  }

  // Fill remaining available widgets that match enabled modules
  for (const def of Object.values(WIDGET_REGISTRY)) {
    if (
      !seen.has(def.key) &&
      !alreadyInLayout.has(def.key) &&
      (!def.moduleKey || enabledModuleKeys.includes(def.moduleKey))
    ) {
      seen.add(def.key)
      ordered.push(def.key)
    }
  }

  return ordered
}
