import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  addSignupModuleWithDependencies,
  calculateSignupQuote,
  getRecommendedSignupModules,
  getSignupPackageForBusinessType,
  hasOnlyValidSignupModules,
  removeSignupModuleWithDependents,
  SIGNUP_BASE_PRICE_CENTS,
  SIGNUP_MODULE_OFFERS,
  SIGNUP_PACKAGE_PRESETS,
} from '../signupModulePricing'

test('van and car rental signup preselects fleet and Van Damage AI', () => {
  const preset = getSignupPackageForBusinessType('van rental')
  const modules = getRecommendedSignupModules({
    businessType: 'van rental',
  })

  assert.equal(preset.key, 'fleet-rental')
  assert.ok(modules.includes('vehicles'))
  assert.ok(modules.includes('damage_ai'))
})

test('business presets cover every signup business type family', () => {
  const expected = new Map([
    ['hair salon', 'salon-studio'],
    ['restaurant', 'hospitality-counter'],
    ['ecommerce', 'retail-commerce'],
    ['plumbing', 'field-service'],
    ['medical clinic', 'health-appointments'],
    ['real estate', 'real-estate-growth'],
    ['photography', 'creative-services'],
    ['auto repair', 'automotive-service'],
  ])

  for (const [businessType, packageKey] of expected) {
    assert.equal(getSignupPackageForBusinessType(businessType).key, packageKey)
  }

  assert.ok(SIGNUP_PACKAGE_PRESETS.length >= 9)
})

test('explicit business needs augment the preset recommendation', () => {
  const modules = getRecommendedSignupModules({
    businessType: 'real estate',
    needs: ['payments', 'appointments'],
  })

  assert.ok(modules.includes('leads'))
  assert.ok(modules.includes('payments'))
  assert.ok(modules.includes('appointments'))
})

test('module quote is the platform base plus each selected module price', () => {
  const selected = ['vehicles', 'damage_ai'] as const
  const moduleTotal = selected.reduce((total, key) => {
    return total + SIGNUP_MODULE_OFFERS.find((module) => module.key === key)!.monthlyPriceCents
  }, 0)
  const quote = calculateSignupQuote(selected)

  assert.equal(quote.basePriceCents, SIGNUP_BASE_PRICE_CENTS)
  assert.equal(quote.modulesPriceCents, moduleTotal)
  assert.equal(quote.monthlyPriceCents, SIGNUP_BASE_PRICE_CENTS + moduleTotal)
})

test('compute-heavy modules cost more than light relationship modules', () => {
  const contacts = SIGNUP_MODULE_OFFERS.find((module) => module.key === 'contacts')!
  const damageAi = SIGNUP_MODULE_OFFERS.find((module) => module.key === 'damage_ai')!

  assert.equal(contacts.workload, 'light')
  assert.equal(damageAi.workload, 'compute')
  assert.ok(damageAi.monthlyPriceCents > contacts.monthlyPriceCents)
})

test('annual quote applies a discount and preserves the selected modules', () => {
  const monthly = calculateSignupQuote(['customers', 'appointments'])
  const yearly = calculateSignupQuote(['customers', 'appointments'], 'yearly')

  assert.ok(yearly.annualPriceCents < monthly.annualPriceCents)
  assert.ok(yearly.annualSavingsCents > 0)
  assert.deepEqual(yearly.selectedModules, ['customers', 'appointments'])
})

test('Fleet dependencies stay valid as modules are customized', () => {
  const added = addSignupModuleWithDependencies([], 'damage_ai')
  assert.deepEqual(added, ['vehicles', 'damage_ai'])

  const removed = removeSignupModuleWithDependents(
    ['vehicles', 'damage_ai', 'maintenance', 'customers'],
    'vehicles'
  )
  assert.deepEqual(removed, ['customers'])
})

test('server validation rejects unknown module keys', () => {
  assert.equal(hasOnlyValidSignupModules(['customers', 'appointments']), true)
  assert.equal(hasOnlyValidSignupModules(['customers', 'made_up_module']), false)
})

test('signup provisioning recalculates pricing server-side and enables the exact selection', () => {
  const onboardingSource = readFileSync(
    new URL('../../onboarding/businessOnboarding.ts', import.meta.url),
    'utf8'
  )
  const completionRoute = readFileSync(
    new URL('../../../app/api/onboarding/business/complete/route.ts', import.meta.url),
    'utf8'
  )

  assert.match(onboardingSource, /calculateSignupQuote\(selectedModules,\s*billingInterval\)/)
  assert.match(onboardingSource, /new Set\(normalizeSignupModuleSelection\(args\.selectedModules\)\)/)
  assert.match(onboardingSource, /Object\.keys\(MODULE_REGISTRY\)/)
  assert.doesNotMatch(onboardingSource, /getModulesForPlan/)
  assert.match(completionRoute, /hasOnlyValidSignupModules\(body\.selectedModules\)/)
})

test('database migration persists package, modules, interval, and server quote', () => {
  const migration = readFileSync(
    new URL(
      '../../../supabase/migrations/20260729130000_signup_module_subscriptions.sql',
      import.meta.url
    ),
    'utf8'
  )

  for (const column of [
    'selected_modules',
    'package_key',
    'selected_package_key',
    'monthly_price_cents',
    'billing_amount_cents',
    'quoted_monthly_cents',
    'billing_interval',
    'pricing_version',
  ]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`))
  }
})
