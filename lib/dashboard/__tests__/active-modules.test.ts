import assert from 'node:assert/strict'
import test from 'node:test'
import {
  filterDashboardLayoutForActiveWidgets,
  getActiveDashboardModulesForTenantUser,
  getActiveWidgetRegistryMeta,
  getWidgetKeysFromLayout,
  userCanAccessWidget,
} from '@/lib/dashboard/activeModules'
import type { DashboardLayout, WidgetDefinition } from '@/lib/dashboard/types'

const registry: Record<string, WidgetDefinition> = {
  fleet_total: {
    key: 'fleet_total',
    label: 'Fleet Total',
    type: 'stat',
    description: 'Fleet count',
    moduleKey: 'vehicles',
    requiredPermission: 'use_modules',
    defaultSection: 'operations',
    priority: 20,
    async fetcher() {
      throw new Error('not called in resolver tests')
    },
  },
  maintenance_urgent: {
    key: 'maintenance_urgent',
    label: 'Urgent Maintenance',
    type: 'stat',
    description: 'Urgent maintenance',
    moduleKey: 'maintenance',
    requiredPermission: 'use_modules',
    defaultSection: 'operations',
    priority: 10,
    async fetcher() {
      throw new Error('not called in resolver tests')
    },
  },
  damage_review: {
    key: 'damage_review',
    label: 'Damage Review',
    type: 'stat',
    description: 'Damage review',
    moduleKey: 'damage_ai',
    requiredPermission: 'use_modules',
    defaultSection: 'operations',
    priority: 15,
    async fetcher() {
      throw new Error('not called in resolver tests')
    },
  },
  payments_revenue: {
    key: 'payments_revenue',
    label: 'Revenue',
    type: 'stat',
    description: 'Revenue',
    moduleKey: 'payments',
    requiredPermission: 'view_reports',
    defaultSection: 'financial',
    priority: 30,
    async fetcher() {
      throw new Error('not called in resolver tests')
    },
  },
  usage_cost: {
    key: 'usage_cost',
    label: 'Usage Cost',
    type: 'usage',
    description: 'Usage diagnostics',
    requiredPermission: 'view_reports',
    tenantFacing: false,
    defaultSection: 'usage',
    priority: 40,
    async fetcher() {
      throw new Error('not called in resolver tests')
    },
  },
}

function tenantConfig(enabledModuleKeys: string[]) {
  return {
    enabledModuleKeys,
    modules: [
      'vehicles',
      'maintenance',
      'damage_ai',
      'payments',
      'store',
      'customers',
      'website',
    ].map((key) => ({
      module_key: key,
      enabled: enabledModuleKeys.includes(key),
      config: {},
    })),
  }
}

test('active resolver returns widgets only for enabled modules', () => {
  const resolved = getActiveDashboardModulesForTenantUser({
    tenantConfig: tenantConfig(['vehicles', 'damage_ai']),
    userRole: 'admin',
    registry,
  })

  assert.deepEqual(
    resolved.widgets.map((widget) => widget.key),
    ['damage_review', 'fleet_total']
  )
  assert.ok(resolved.disabledModuleKeys.includes('maintenance'))
  assert.equal(
    resolved.modules.find((module) => module.key === 'maintenance')?.hiddenReason,
    'module_disabled'
  )
})

test('inactive module widgets are pruned from saved dashboard layout before fetch', () => {
  const layout: DashboardLayout = {
    sections: [
      {
        id: 'operations',
        title: 'Operations',
        widgets: [
          { id: 'w1', key: 'fleet_total', type: 'stat' },
          { id: 'w2', key: 'maintenance_urgent', type: 'stat' },
          { id: 'w3', key: 'damage_review', type: 'stat' },
        ],
      },
    ],
  }

  const filtered = filterDashboardLayoutForActiveWidgets(layout, ['fleet_total'])

  assert.deepEqual(getWidgetKeysFromLayout(filtered), ['fleet_total'])
  assert.equal(filtered.sections.find((section) => section.id === 'operations')?.widgets.length, 1)
})

test('staff sees operational widgets but not report-only financial widgets', () => {
  const resolved = getActiveDashboardModulesForTenantUser({
    tenantConfig: tenantConfig(['vehicles', 'payments']),
    userRole: 'staff',
    registry,
  })

  assert.deepEqual(
    resolved.widgets.map((widget) => widget.key),
    ['fleet_total']
  )
  assert.equal(userCanAccessWidget('staff', registry.payments_revenue), false)
  assert.equal(userCanAccessWidget('manager', registry.payments_revenue), true)
})

test('tenant-facing resolver excludes owner or diagnostics-only widgets', () => {
  const resolved = getActiveDashboardModulesForTenantUser({
    tenantConfig: tenantConfig(['vehicles']),
    userRole: 'admin',
    registry,
  })

  assert.equal(
    resolved.widgets.some((widget) => widget.key === 'usage_cost'),
    false
  )
})

test('active registry metadata exposes only allowed widget definitions', () => {
  const meta = getActiveWidgetRegistryMeta(['maintenance_urgent'], registry)

  assert.deepEqual(Object.keys(meta), ['maintenance_urgent'])
  assert.equal(meta.maintenance_urgent.defaultSection, 'operations')
})

test('widget ordering is deterministic and critical alerts come first', () => {
  const resolved = getActiveDashboardModulesForTenantUser({
    tenantConfig: tenantConfig(['vehicles', 'maintenance', 'damage_ai']),
    userRole: 'admin',
    registry,
  })

  assert.deepEqual(
    resolved.widgets.map((widget) => widget.key),
    ['maintenance_urgent', 'damage_review', 'fleet_total']
  )
})
