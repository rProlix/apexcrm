import type { LucideIcon } from 'lucide-react'

/** Canonical module keys — must match tenant_modules.module_key values */
export type ModuleKey =
  | 'payments'
  | 'appointments'
  | 'rewards'
  | 'vehicles'
  | 'damage_ai'
  | 'leads'
  | 'messages'
  | 'contacts'
  | 'store'
  | 'website'
  | 'customers'
  | 'product_360_spin'

export type StatCategory = 'operations' | 'financial' | 'usage'

/**
 * A structured dashboard stat contributed by a module.
 * Stats are fetched individually, categorized, and grouped into sections
 * by the dashboard config system.
 */
export interface DashboardStat {
  key:          string
  label:        string
  category:     StatCategory
  getValue:     (tenantId: string) => Promise<number | string>
  format?:      (value: number | string) => string
  emptyMessage?: string
  /** Optional: override the accent color (Tailwind class) */
  color?:       string
}

/** A stat with its resolved value — used in PremiumDashboard */
export interface ResolvedStat {
  key:          string
  label:        string
  category:     StatCategory
  value:        number | string
  formatted:    string
  isEmpty:      boolean
  emptyMessage: string
  color?:       string
}

/** A grouped section rendered in PremiumDashboard */
export interface DashboardSection {
  title:    string
  category: StatCategory
  stats:    ResolvedStat[]
}

/** Full resolved dashboard config passed to PremiumDashboard */
export interface DashboardConfig {
  sections: DashboardSection[]
}

// ─── Legacy stat type used by ModuleCard grid ───────────────────

/** A single statistic shown on the module card (used by ModuleGrid) */
export interface ModuleStat {
  label: string
  value: string | number
}

/**
 * Serializable subset of ModuleDefinition safe to pass from Server→Client.
 * Contains no React components or functions.
 */
export interface NavModule {
  key:   string
  label: string
  href:  string
}

/** Full module definition registered in MODULE_REGISTRY */
export interface ModuleDefinition {
  key:         ModuleKey
  label:       string
  description: string
  icon:        LucideIcon
  href:        string
  color:       string
  bgColor:     string
  order:       number
  /** Categorized stats for PremiumDashboard */
  stats?:      DashboardStat[]
  /** Legacy quick-stats for ModuleCard grid */
  getStats?:   (tenantId: string) => Promise<ModuleStat[]>
}
