// ─── Layout ──────────────────────────────────────────────────────

export interface WidgetConfig {
  id: string // unique within layout (e.g. "w_vehicles_total_1")
  key: string // maps to WIDGET_REGISTRY key
  type: 'stat' | 'chart' | 'usage'
  title?: string // optional override label
}

export interface LayoutSection {
  id: string
  title: string
  widgets: WidgetConfig[]
}

export interface DashboardLayout {
  sections: LayoutSection[]
}

// ─── Widget data shapes ───────────────────────────────────────────

export interface WidgetDataStat {
  type: 'stat'
  value: string | number
  formatted: string
  label: string
  color?: string
  emptyMessage?: string
}

export interface WidgetDataChart {
  type: 'chart'
  label: string
  points: { date: string; value: number }[]
  color?: string
}

export interface WidgetDataUsage {
  type: 'usage'
  label: string
  total_cents: number
  items: { label: string; cents: number; color: string }[]
}

export interface WidgetDataError {
  type: 'error'
  label: string
  message: string
}

export type WidgetData = WidgetDataStat | WidgetDataChart | WidgetDataUsage | WidgetDataError

// ─── Registry definition ─────────────────────────────────────────

export interface WidgetDefinition {
  key: string
  label: string
  type: WidgetConfig['type']
  description: string
  moduleKey?: string // which module must be enabled for this widget
  requiredPermission?: string
  emptyMessage?: string
  ownerOnly?: boolean
  tenantFacing?: boolean
  priority?: number
  defaultSection: string // 'operations' | 'financial' | 'usage'
  fetcher: (tenantId: string) => Promise<WidgetData>
}
