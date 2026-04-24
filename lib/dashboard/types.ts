// ─── Layout ──────────────────────────────────────────────────────

export interface WidgetConfig {
  id:      string   // unique within layout (e.g. "w_vehicles_total_1")
  key:     string   // maps to WIDGET_REGISTRY key
  type:    'stat' | 'chart' | 'usage'
  title?:  string   // optional override label
}

export interface LayoutSection {
  id:      string
  title:   string
  widgets: WidgetConfig[]
}

export interface DashboardLayout {
  sections: LayoutSection[]
}

// ─── Widget data shapes ───────────────────────────────────────────

export interface WidgetDataStat {
  type:      'stat'
  value:     string | number
  formatted: string
  label:     string
  color?:    string
}

export interface WidgetDataChart {
  type:   'chart'
  label:  string
  points: { date: string; value: number }[]
  color?: string
}

export interface WidgetDataUsage {
  type:        'usage'
  label:       string
  total_cents: number
  items:       { label: string; cents: number; color: string }[]
}

export type WidgetData = WidgetDataStat | WidgetDataChart | WidgetDataUsage

// ─── Registry definition ─────────────────────────────────────────

export interface WidgetDefinition {
  key:            string
  label:          string
  type:           WidgetConfig['type']
  description:    string
  moduleKey?:     string      // which module must be enabled for this widget
  defaultSection: string      // 'operations' | 'financial' | 'usage'
  fetcher:        (tenantId: string) => Promise<WidgetData>
}
