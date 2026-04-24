import { MODULE_REGISTRY } from '@/modules/registry'
import type {
  DashboardConfig,
  DashboardSection,
  DashboardStat,
  ResolvedStat,
  StatCategory,
} from '@/modules/shared/moduleTypes'

const SECTION_LABELS: Record<StatCategory, string> = {
  operations: 'Operations',
  financial:  'Financial',
  usage:      'Usage',
}

// Section display order
const CATEGORY_ORDER: StatCategory[] = ['operations', 'financial', 'usage']

/**
 * Builds a fully resolved dashboard config for a tenant.
 *
 * - Collects DashboardStat definitions from all enabled modules
 * - Fetches all stat values in parallel
 * - Groups resolved stats into sections by category
 * - Filters out sections with only empty stats
 */
export async function getDashboardConfig(
  tenantId: string,
  enabledModuleKeys: string[]
): Promise<DashboardConfig> {
  // Collect all DashboardStat entries from enabled modules
  const allStats: DashboardStat[] = enabledModuleKeys.flatMap((key) => {
    const mod = MODULE_REGISTRY[key as keyof typeof MODULE_REGISTRY]
    return mod?.stats ?? []
  })

  if (allStats.length === 0) {
    return { sections: [] }
  }

  // Fetch all stat values in parallel — isolate failures per stat
  const resolved: ResolvedStat[] = await Promise.all(
    allStats.map(async (stat) => {
      let value: number | string = 0
      let isEmpty = true

      try {
        value   = await stat.getValue(tenantId)
        isEmpty = isEmptyValue(value)
      } catch {
        isEmpty = true
      }

      const formatted = stat.format ? stat.format(value) : String(value)

      return {
        key:          stat.key,
        label:        stat.label,
        category:     stat.category,
        value,
        formatted,
        isEmpty,
        emptyMessage: stat.emptyMessage ?? 'No data yet',
        color:        stat.color,
      }
    })
  )

  // Group into sections by category, preserving CATEGORY_ORDER
  const sections: DashboardSection[] = CATEGORY_ORDER.reduce<DashboardSection[]>(
    (acc, category) => {
      const stats = resolved.filter((s) => s.category === category)

      // Drop sections that are entirely empty
      const hasData = stats.some((s) => !s.isEmpty)
      if (stats.length === 0 || !hasData) return acc

      acc.push({
        title: SECTION_LABELS[category],
        category,
        stats,
      })

      return acc
    },
    []
  )

  return { sections }
}

function isEmptyValue(value: number | string): boolean {
  if (typeof value === 'number') return value === 0
  if (typeof value === 'string') {
    const stripped = value.replace(/[$,\s]/g, '')
    return stripped === '' || stripped === '0' || stripped === '0.00' || stripped === '—'
  }
  return true
}
