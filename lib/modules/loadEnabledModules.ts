import { MODULE_REGISTRY } from '@/modules/registry'
import type { ModuleDefinition } from '@/modules/shared/moduleTypes'

/**
 * Resolves the list of enabled module definitions for a tenant
 * by cross-referencing the tenant's enabled module keys against the registry.
 *
 * Only returns modules that are both:
 * - enabled in tenant_modules
 * - registered in MODULE_REGISTRY
 */
export function loadEnabledModules(enabledKeys: string[]): ModuleDefinition[] {
  return enabledKeys
    .map((key) => (MODULE_REGISTRY as Record<string, ModuleDefinition | undefined>)[key])
    .filter((mod): mod is ModuleDefinition => mod !== undefined)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
}
