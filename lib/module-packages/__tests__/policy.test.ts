import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import {
  moduleStateAfterPackage,
  slugifyPackageName,
  validateModulePackageInput,
} from '@/lib/module-packages/policy'
import type { ModuleKey } from '@/modules/shared/moduleTypes'

const moduleCatalog: ModuleKey[] = [
  'vehicles',
  'damage_ai',
  'maintenance',
  'appointments',
  'customers',
  'payments',
  'store',
  'rewards',
]

test('package names produce stable lowercase slugs', () => {
  assert.equal(slugifyPackageName('  Fleet Pro + Reports  '), 'fleet-pro-reports')
})

test('package validation deduplicates modules and benefits against the canonical catalog', () => {
  const result = validateModulePackageInput(
    {
      name: 'Fleet Pro',
      slug: 'fleet-pro',
      description: 'Fleet operations',
      benefits: ['Reports', ' Reports ', 'Staff activity'],
      moduleKeys: ['vehicles', 'damage_ai', 'vehicles', 'unknown'],
    },
    moduleCatalog
  )
  assert.equal(result.ok, true)
  assert.deepEqual(result.value?.moduleKeys, ['vehicles', 'damage_ai'])
  assert.deepEqual(result.value?.benefits, ['Reports', 'Staff activity'])
})

test('a package must include a real registered module', () => {
  const result = validateModulePackageInput(
    {
      name: 'Empty Package',
      slug: 'empty-package',
      moduleKeys: ['reports'],
      benefits: [],
    },
    moduleCatalog
  )
  assert.equal(result.ok, false)
  assert.match(result.error ?? '', /at least one module/i)
})

test('applying a package enables only its selected canonical modules', () => {
  const state = moduleStateAfterPackage(moduleCatalog, ['vehicles', 'damage_ai', 'maintenance'])
  assert.equal(state.vehicles, true)
  assert.equal(state.damage_ai, true)
  assert.equal(state.maintenance, true)
  assert.equal(state.payments, false)
  assert.equal(state.store, false)
})

test('module package migration is owner-only, atomic, and seeds the requested examples', async () => {
  const sql = await readFile(
    path.join(process.cwd(), 'supabase/migrations/20260724180000_owner_module_packages.sql'),
    'utf8'
  )
  for (const table of [
    'owner_module_packages',
    'owner_module_package_items',
    'tenant_module_package_applications',
  ]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`, 'i'))
  }
  assert.match(sql, /public\.is_platform_owner\(\)/)
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.apply_owner_module_package/i)
  assert.match(sql, /ON CONFLICT \(tenant_id, module_key\)/i)
  assert.match(sql, /previous_modules/i)
  for (const packageName of ['Fleet Starter', 'Fleet Pro', 'Salon Starter', 'Retail Pro']) {
    assert.match(sql, new RegExp(`'${packageName}'`))
  }
})

test('daily newspaper includes Level 3 detection and dispatch warnings', async () => {
  const source = await readFile(
    path.join(process.cwd(), 'lib/command-center/dailySummary.ts'),
    'utf8'
  )
  assert.match(source, /van_damage_attention_alerts/)
  assert.match(source, /Level 3 damage detected/)
  assert.match(source, /should not be dispatched until reviewed/)
  assert.match(source, /first_triggered_at/)
})
