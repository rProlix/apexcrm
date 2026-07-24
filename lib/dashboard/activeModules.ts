import { hasPermission } from '@/lib/auth/permissions'
import { DEFAULT_LAYOUT } from '@/lib/dashboard/loadLayout'
import { WIDGET_REGISTRY } from '@/lib/dashboard/widgetRegistry'
import type { AnyRole } from '@/lib/auth/types'
import type { DashboardLayout, WidgetConfig, WidgetDefinition } from '@/lib/dashboard/types'
import type { TenantConfig } from '@/lib/tenant/loadTenantConfig'
import type { ModuleKey } from '@/modules/shared/moduleTypes'

export interface ResolvedDashboardWidget {
  key: string
  moduleKey: string | null
  displayName: string
  defaultSection: string
  requiredPermission: string
  priority: number
}

export interface ResolvedDashboardModule {
  key: string
  displayName: string
  enabled: boolean
  canAccess: boolean
  hasDashboardWidgets: boolean
  requiredPermissions: string[]
  widgets: ResolvedDashboardWidget[]
  hiddenReason?: 'module_disabled' | 'permission_denied' | 'no_dashboard_widgets'
}

export interface ActiveDashboardModulesResult {
  enabledModuleKeys: string[]
  disabledModuleKeys: string[]
  accessibleModuleKeys: string[]
  widgets: ResolvedDashboardWidget[]
  modules: ResolvedDashboardModule[]
}

interface ResolveInput {
  tenantConfig: Pick<TenantConfig, 'modules' | 'enabledModuleKeys'>
  userRole: AnyRole
  registry?: Record<string, WidgetDefinition>
}

export function getActiveDashboardModulesForTenantUser({
  tenantConfig,
  userRole,
  registry = WIDGET_REGISTRY,
}: ResolveInput): ActiveDashboardModulesResult {
  const enabledModuleKeys = new Set(tenantConfig.enabledModuleKeys)
  const knownModuleKeys = new Set<string>([
    ...tenantConfig.modules.map((module) => module.module_key),
    ...Object.values(registry).flatMap((widget) => (widget.moduleKey ? [widget.moduleKey] : [])),
  ])

  const enabledWidgets = Object.values(registry)
    .filter((widget) => isWidgetTenantFacing(widget))
    .filter((widget) => !widget.moduleKey || enabledModuleKeys.has(widget.moduleKey))
    .filter((widget) => userCanAccessWidget(userRole, widget))
    .sort(compareDashboardWidgets)
    .map(toResolvedWidget)

  const widgetsByModule = new Map<string, ResolvedDashboardWidget[]>()
  for (const widget of enabledWidgets) {
    if (!widget.moduleKey) continue
    widgetsByModule.set(widget.moduleKey, [
      ...(widgetsByModule.get(widget.moduleKey) ?? []),
      widget,
    ])
  }

  const modules = Array.from(knownModuleKeys)
    .sort()
    .map((key): ResolvedDashboardModule => {
      const moduleWidgets = Object.values(registry).filter((widget) => widget.moduleKey === key)
      const requiredPermissions = Array.from(
        new Set(moduleWidgets.map((widget) => widget.requiredPermission ?? 'view_dashboard'))
      )
      const enabled = enabledModuleKeys.has(key)
      const accessibleWidgets = widgetsByModule.get(key) ?? []
      const canAccess =
        enabled &&
        (moduleWidgets.length === 0 ||
          moduleWidgets.some((widget) => userCanAccessWidget(userRole, widget)))

      return {
        key,
        displayName: key,
        enabled,
        canAccess,
        hasDashboardWidgets: moduleWidgets.length > 0,
        requiredPermissions,
        widgets: accessibleWidgets,
        hiddenReason: enabled
          ? accessibleWidgets.length > 0
            ? undefined
            : moduleWidgets.length > 0
              ? 'permission_denied'
              : 'no_dashboard_widgets'
          : 'module_disabled',
      }
    })

  return {
    enabledModuleKeys: Array.from(enabledModuleKeys),
    disabledModuleKeys: Array.from(knownModuleKeys)
      .filter((key) => !enabledModuleKeys.has(key))
      .sort(),
    accessibleModuleKeys: modules
      .filter((module) => module.enabled && module.canAccess)
      .map((module) => module.key),
    widgets: enabledWidgets,
    modules,
  }
}

export function filterDashboardLayoutForActiveWidgets(
  layout: DashboardLayout,
  activeWidgetKeys: Iterable<string>
): DashboardLayout {
  const allowed = new Set(activeWidgetKeys)
  const sectionMap = new Map(DEFAULT_LAYOUT.sections.map((section) => [section.id, section.title]))

  const sections = layout.sections.map((section) => ({
    ...section,
    title: section.title || sectionMap.get(section.id) || section.id,
    widgets: section.widgets.filter((widget) => allowed.has(widget.key)),
  }))

  for (const section of DEFAULT_LAYOUT.sections) {
    if (!sections.some((existing) => existing.id === section.id)) {
      sections.push({ ...section, widgets: [] })
    }
  }

  return { sections }
}

export function getWidgetKeysFromLayout(layout: DashboardLayout): string[] {
  return layout.sections.flatMap((section) => section.widgets.map((widget) => widget.key))
}

export function getActiveWidgetRegistryMeta(
  activeWidgetKeys: Iterable<string>,
  registry: Record<string, WidgetDefinition> = WIDGET_REGISTRY
) {
  const allowed = new Set(activeWidgetKeys)

  return Object.fromEntries(
    Object.values(registry)
      .filter((widget) => allowed.has(widget.key))
      .sort(compareDashboardWidgets)
      .map((def) => [
        def.key,
        {
          key: def.key,
          label: def.label,
          description: def.description,
          type: def.type,
          defaultSection: def.defaultSection,
        },
      ])
  )
}

export function userCanAccessWidget(userRole: AnyRole, widget: WidgetDefinition): boolean {
  if (widget.ownerOnly && userRole !== 'owner') return false
  return hasPermission(userRole, widget.requiredPermission ?? 'view_dashboard')
}

export function widgetConfigFromDefinition(def: WidgetDefinition): WidgetConfig {
  return {
    id: `w_${def.key}`,
    key: def.key,
    type: def.type,
  }
}

function isWidgetTenantFacing(widget: WidgetDefinition): boolean {
  return widget.tenantFacing !== false && widget.ownerOnly !== true
}

function compareDashboardWidgets(a: WidgetDefinition, b: WidgetDefinition): number {
  return (a.priority ?? 100) - (b.priority ?? 100) || a.key.localeCompare(b.key)
}

function toResolvedWidget(widget: WidgetDefinition): ResolvedDashboardWidget {
  return {
    key: widget.key,
    moduleKey: widget.moduleKey ?? null,
    displayName: widget.label,
    defaultSection: widget.defaultSection,
    requiredPermission: widget.requiredPermission ?? 'view_dashboard',
    priority: widget.priority ?? 100,
  }
}

export function moduleKey(value: string): ModuleKey | string {
  return value as ModuleKey
}
