// lib/modules/defaultModules.ts
// Fallback enabled/disabled state applied when a tenant has no record for a module.
// Used by getTenantModules, isModuleEnabled, and middleware enforcement.

import type { ModuleKey } from '@/modules/shared/moduleTypes'

/**
 * Default module states.
 * true  → enabled by default (tenant opted in automatically on signup)
 * false → disabled by default (tenant must explicitly enable)
 */
export const DEFAULT_MODULE_STATES: Record<ModuleKey, boolean> = {
  payments: true,
  appointments: true,
  contacts: true,
  leads: true,
  messages: true,
  store: true,
  website: true,
  customers: true,
  rewards: false, // opt-in: not all businesses run loyalty programs
  vehicles: false, // opt-in: fleet/rental vertical only
  maintenance: false, // opt-in: fleet maintenance workflows
  damage_ai: false, // opt-in: requires vehicle module + AI setup
  product_360: false, // opt-in: AI 360 product studio
  inventory: false, // opt-in: inventory tracking module
  pos: false, // opt-in: point of sale module
}

/**
 * Subset of module keys that are considered "critical" — disabling them
 * would break core CRM functionality. Used to warn owners before disabling.
 */
export const CRITICAL_MODULE_KEYS: ReadonlySet<ModuleKey> = new Set(['contacts', 'leads'])

/**
 * Returns the default enabled state for a module key.
 * Falls back to true (enabled) for any unknown/future modules.
 */
export function getDefaultModuleState(moduleKey: string): boolean {
  return DEFAULT_MODULE_STATES[moduleKey as ModuleKey] ?? true
}
